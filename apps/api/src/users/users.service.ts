import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { signSession } from '../auth/session';
import { passwordProblem } from '../common/password';
import { PrismaService } from '../prisma.service';

/** Solo estos campos salen de la API: nunca `passwordHash` ni `tokenVersion`. */
const PUBLIC = { id: true, username: true, fullName: true, role: true, active: true, mustChangePassword: true, createdAt: true } as const;

const ROLE_ORDER: Role[] = ['ADMINISTRADOR', 'SUPERVISOR_RUTAS', 'GERENTE_COMPRAS', 'CAJERO', 'ALMACENISTA', 'CHOFER'];
const byRoleThenName = (a: { role: Role; fullName: string }, b: { role: Role; fullName: string }) =>
  ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.fullName.localeCompare(b.fullName, 'es');

/** Anotaciones de la bitácora que no son trabajo hecho en el negocio: no impiden borrar al usuario. */
const OWN_SESSION_AUDITS = ['/auth/change-password', '/driver/status'];

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async list() {
    const users = await this.prisma.user.findMany({ select: PUBLIC });
    return users.sort(byRoleThenName);
  }

  async create(dto: { username: string; fullName: string; role: Role; password: string; mustChangePassword?: boolean }) {
    const problem = passwordProblem(dto.password, dto.username);
    if (problem) throw new BadRequestException(problem);
    try {
      return await this.prisma.user.create({
        data: {
          username: dto.username,
          fullName: dto.fullName,
          role: dto.role,
          passwordHash: await bcrypt.hash(dto.password, 10),
          mustChangePassword: dto.mustChangePassword ?? true,
        },
        select: PUBLIC,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw new ConflictException('Ya existe un usuario con ese nombre de usuario.');
      throw e;
    }
  }

  async update(id: number, dto: { fullName?: string; role?: Role; active?: boolean }, actorId: number) {
    if (id === actorId) {
      if (dto.active === false) throw new BadRequestException('No puedes desactivarte a ti mismo.');
      if (dto.role !== undefined && dto.role !== Role.ADMINISTRADOR) throw new BadRequestException('No puedes quitarte a ti mismo el rol de administrador.');
    }
    const current = await this.prisma.user.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Usuario no encontrado.');
    // desactivar o cambiar de rol cierra sus sesiones abiertas
    const closeSessions = (dto.active === false && current.active) || (dto.role !== undefined && dto.role !== current.role);
    return this.prisma.user.update({
      where: { id },
      data: { fullName: dto.fullName, role: dto.role, active: dto.active, ...(closeSessions ? { tokenVersion: { increment: 1 } } : {}) },
      select: PUBLIC,
    });
  }

  /**
   * Borra para siempre un usuario que nunca trabajó en el sistema (creado por error o de prueba). Si tiene ventas,
   * turnos, rutas u otros registros responde 409: borrarlo dejaría ese historial sin nombre, así que se desactiva.
   */
  async remove(id: number, actorId: number) {
    if (id === actorId) throw new BadRequestException('No puedes borrarte a ti mismo.');
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.user.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Usuario no encontrado.');
      const history = await this.history(tx, id);
      if (history.length)
        throw new ConflictException(
          `No se puede borrar a ${current.fullName} porque tiene registros en el sistema (${history.join(', ')}). Desactívalo: ya no podrá entrar y su historial se conserva.`,
        );
      // lo que quede en la bitácora (su cambio de contraseña, avisos de la app) se conserva y anota quién era
      await tx.auditLog.updateMany({ where: { userId: id }, data: { userId: null, payload: { usuarioBorrado: current.username } } });
      await tx.user.delete({ where: { id } });
      return { id, username: current.username };
    });
  }

  /** Qué registros del negocio llevan a esta persona; vacío si nunca trabajó en el sistema. */
  private async history(tx: Prisma.TransactionClient, id: number): Promise<string[]> {
    const found: [string, number][] = [
      ['turnos de caja', await tx.cashShift.count({ where: { cashierId: id } })],
      ['ventas', await tx.sale.count({ where: { OR: [{ cashierId: id }, { discountAuthorizedById: id }, { cancelAuthorizedById: id }] } })],
      ['devoluciones', await tx.creditNote.count({ where: { userId: id } })],
      ['rutas', await tx.route.count({ where: { driverId: id } })],
      ['cobros en ruta', await tx.payment.count({ where: { userId: id } })],
      ['incidencias', await tx.incident.count({ where: { userId: id } })],
      ['movimientos de inventario', await tx.inventoryMovement.count({ where: { userId: id } })],
      ['conteos de inventario', await tx.inventoryCount.count({ where: { createdBy: id } })],
      ['órdenes de compra', await tx.purchaseOrder.count({ where: { createdBy: id } })],
      ['recepciones de compra', await tx.purchaseReceipt.count({ where: { receivedBy: id } })],
      ['cambios en la bitácora', await tx.auditLog.count({ where: { userId: id, entity: { notIn: OWN_SESSION_AUDITS } } })],
    ];
    return found.filter(([, n]) => n > 0).map(([label, n]) => `${label}: ${n}`);
  }

  /**
   * El administrador pone una contraseña nueva. Cierra las sesiones del usuario (tokenVersion + 1) y, por omisión,
   * le pide elegir la suya al entrar. Si se la cambia a sí mismo, la respuesta trae un `accessToken` nuevo para seguir
   * en la sesión (y por omisión no se le vuelve a pedir el cambio).
   */
  async setPassword(id: number, dto: { password: string; mustChangePassword?: boolean }, actorId: number) {
    const current = await this.prisma.user.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Usuario no encontrado.');
    const problem = passwordProblem(dto.password, current.username);
    if (problem) throw new BadRequestException(problem);
    const self = id === actorId;
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash: await bcrypt.hash(dto.password, 10),
        mustChangePassword: dto.mustChangePassword ?? !self,
        tokenVersion: { increment: 1 },
      },
      select: { ...PUBLIC, fullName: true, tokenVersion: true },
    });
    const { tokenVersion: _tv, ...user } = updated;
    return self ? { user, accessToken: await signSession(this.jwt, updated) } : { user };
  }
}
