import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RefundMethod, SalePayment } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { InventoryService } from '../inventory/inventory.service';
import { LoginLimiter } from '../common/login-limiter';
import { addDays, businessDate, startOfBusinessDay } from '../common/time';
import { PrismaService } from '../prisma.service';

type Tx = Prisma.TransactionClient;
/** Bloquea la fila hasta el fin de la transacción: las operaciones simultáneas sobre la misma venta o cliente van en fila. */
const lockRow = (tx: Tx, table: 'Sale' | 'Customer', id: number) => tx.$queryRawUnsafe(`SELECT id FROM "${table}" WHERE id = $1 FOR UPDATE`, id);

/**
 * Bloquea el turno hasta el fin de la transacción y comprueba que siga abierto.
 * Ventas, devoluciones y cancelaciones lo toman en modo compartido (no se estorban entre sí);
 * el cierre lo toma exclusivo, así que espera a las operaciones en curso y las que llegan después ven el turno cerrado.
 */
async function lockShift(tx: Tx, shiftId: number, mode: 'SHARE' | 'UPDATE') {
  const rows = await tx.$queryRawUnsafe<{ status: string }[]>(`SELECT status::text AS status FROM "CashShift" WHERE id = $1 FOR ${mode}`, shiftId);
  if (!rows.length) throw new NotFoundException('Turno no encontrado');
  if (rows[0].status !== 'ABIERTO') throw new BadRequestException('El turno de caja ya está cerrado');
}

const num = (d: Prisma.Decimal | number | null | undefined) => Number(d ?? 0);
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;
/** Inicio del día local del negocio (las ventas "de hoy" empiezan a la medianoche de México, no a la de UTC). */
const startOfToday = () => startOfBusinessDay();
const money = (n: number) => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const STORE = {
  name: 'Forrajera San Miguel',
  address: 'Av. Hidalgo 214, Col. Centro, Tulancingo, Hgo.',
  // Datos ficticios de la forrajera de demostración (ver apps/api/prisma/seed-data.ts)
  rfc: 'FSM080512KD3',
  phone: '775 555 0142',
};

export interface SaleLineInput {
  productId: number;
  presentationId?: number | null;
  quantity: number;
}
export interface Authorization {
  username: string;
  password: string;
}

@Injectable()
export class PosService {
  constructor(
    private prisma: PrismaService,
    private inventory: InventoryService,
    private limiter: LoginLimiter,
  ) {}

  // ---------- turno de caja ----------
  private openShiftOf(userId: number) {
    return this.prisma.cashShift.findFirst({ where: { cashierId: userId, status: 'ABIERTO' } });
  }
  private async requireShift(userId: number) {
    const shift = await this.openShiftOf(userId);
    if (!shift) throw new BadRequestException('Abre el turno de caja antes de vender');
    return shift;
  }

  async openShift(userId: number, openingFloat: number) {
    if (await this.openShiftOf(userId)) throw new ConflictException('Ya tienes un turno abierto');
    try {
      return await this.prisma.cashShift.create({ data: { cashierId: userId, openingFloat } });
    } catch (e) {
      // Índice único parcial: dos aperturas simultáneas del mismo cajero no pueden crear dos turnos.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Ya tienes un turno abierto');
      throw e;
    }
  }

  async currentShift(userId: number) {
    const shift = await this.openShiftOf(userId);
    if (!shift) return null;
    return this.shiftSummary(shift.id);
  }

  private async shiftSummary(shiftId: number, db: Tx | PrismaService = this.prisma) {
    const shift = await db.cashShift.findUniqueOrThrow({ where: { id: shiftId } });
    const sales = await db.sale.findMany({ where: { shiftId } });
    const notes = await db.creditNote.findMany({ where: { shiftId } });
    const done = sales.filter((s) => s.status !== 'CANCELADA');
    const byMethod: Record<string, { count: number; total: number }> = {};
    for (const m of ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'CREDITO']) byMethod[m] = { count: 0, total: 0 };
    for (const s of done) {
      byMethod[s.paymentMethod].count++;
      byMethod[s.paymentMethod].total = r2(byMethod[s.paymentMethod].total + num(s.total));
    }
    const cashRefunds = r2(notes.filter((n) => n.refundMethod === 'EFECTIVO').reduce((a, n) => a + num(n.total), 0));
    const expectedCash = r2(num(shift.openingFloat) + byMethod.EFECTIVO.total - cashRefunds);
    return {
      shift: {
        id: shift.id,
        register: shift.register,
        openedAt: shift.openedAt,
        closedAt: shift.closedAt,
        status: shift.status,
        openingFloat: num(shift.openingFloat),
        countedCash: shift.countedCash === null ? null : num(shift.countedCash),
        difference: shift.difference === null ? null : num(shift.difference),
      },
      salesCount: done.length,
      cancelledCount: sales.length - done.length,
      total: r2(done.reduce((a, s) => a + num(s.total), 0)),
      byMethod,
      cashRefunds,
      creditNotesTotal: r2(notes.reduce((a, n) => a + num(n.total), 0)),
      expectedCash,
    };
  }

  async closeShift(userId: number, dto: { countedCash: number; notes?: string; denominations?: Record<string, number> }) {
    const shift = await this.requireShift(userId);
    // Con el turno bloqueado el efectivo esperado ya incluye toda venta en curso, y ninguna otra puede entrar después del corte.
    const difference = await this.prisma.$transaction(
      async (tx) => {
        await lockShift(tx, shift.id, 'UPDATE');
        const sum = await this.shiftSummary(shift.id, tx);
        const diff = r2(dto.countedCash - sum.expectedCash);
        await tx.cashShift.update({
          where: { id: shift.id },
          data: {
            status: 'CERRADO',
            closedAt: new Date(),
            expectedCash: sum.expectedCash,
            countedCash: dto.countedCash,
            difference: diff,
            notes: dto.notes,
            denominations: dto.denominations as Prisma.InputJsonValue | undefined,
          },
        });
        return diff;
      },
      { timeout: 20000 },
    );
    return { ...(await this.shiftSummary(shift.id)), difference };
  }

  // ---------- catálogo y clientes ----------
  async catalog(q?: string, line?: string) {
    const products = await this.prisma.product.findMany({
      where: {
        active: true,
        ...(line ? { line: { code: line.toUpperCase() } } : {}),
        ...(q ? { OR: [{ code: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] } : {}),
      },
      include: { line: true, presentations: { orderBy: { factor: 'desc' } } },
      orderBy: { name: 'asc' },
    });
    const sums = await this.prisma.stockLot.groupBy({ by: ['productId'], _sum: { quantity: true } });
    const stock = new Map(sums.map((s) => [s.productId, num(s._sum.quantity)]));
    const out: any[] = [];
    for (const p of products) {
      const kg = stock.get(p.id) ?? 0;
      const pres = p.presentations.length
        ? p.presentations.map((x) => ({
            id: x.id as number | null,
            name: x.name,
            factor: num(x.factor),
            price: x.salePrice !== null ? num(x.salePrice) : r2(num(p.salePrice) * num(x.factor)),
          }))
        : [{ id: null, name: p.unit === 'kg' ? 'Granel · kg' : p.unit, factor: 1, price: num(p.salePrice) }];
      for (const x of pres) {
        out.push({
          key: `${p.id}-${x.id ?? 0}`,
          productId: p.id,
          presentationId: x.id,
          code: p.code,
          name: p.name,
          line: p.line.code,
          presentation: x.name,
          factor: x.factor,
          price: x.price,
          stockKg: kg,
          stockUnits: Math.floor(kg / x.factor),
          low: kg <= num(p.minStock),
        });
      }
    }
    return out;
  }

  async creditOf(customerId: number, db: Tx | PrismaService = this.prisma) {
    const c = await db.customer.findUnique({ where: { id: customerId } });
    if (!c) throw new NotFoundException('Cliente no encontrado');
    const open = await db.sale.findMany({ where: { customerId, status: 'POR_COBRAR', balance: { gt: 0 } } });
    const today = businessDate();
    const balance = r2(open.reduce((a, s) => a + num(s.balance), 0));
    const overdue = r2(open.filter((s) => s.dueDate && s.dueDate < today).reduce((a, s) => a + num(s.balance), 0));
    const limit = num(c.creditLimit);
    const available = Math.max(0, r2(limit - balance));
    let reason: string | null = null;
    if (limit <= 0) reason = 'El cliente no tiene crédito autorizado';
    else if (overdue > 0) reason = `Tiene saldo vencido de ${money(overdue)}`;
    else if (balance >= limit) reason = 'Alcanzó su límite de crédito';
    return { id: c.id, name: c.name, rfc: c.rfc, creditLimit: limit, creditDays: c.creditDays, balance, overdue, available, blocked: reason !== null, reason };
  }

  async customers(q?: string) {
    const rows = await this.prisma.customer.findMany({ where: q ? { name: { contains: q, mode: 'insensitive' } } : {}, orderBy: { name: 'asc' }, take: 30 });
    return Promise.all(rows.map((c) => this.creditOf(c.id)));
  }

  // ---------- autorización de supervisor ----------
  private async authorize(userId: number, a?: Authorization): Promise<number> {
    // la llave incluye a quien intenta (el cajero): los errores de una caja no bloquean a las demás
    const key = `supervisor:${userId}:${(a?.username ?? '').trim().toLowerCase()}`;
    this.limiter.check(key);
    const user = a?.username ? await this.prisma.user.findUnique({ where: { username: a.username.trim() } }) : null;
    const ok =
      !!user && user.active && ['SUPERVISOR_RUTAS', 'ADMINISTRADOR'].includes(user.role) && (await bcrypt.compare(a!.password ?? '', user.passwordHash));
    if (!ok) {
      this.limiter.fail(key);
      throw new ForbiddenException('Autorización inválida: se requiere un supervisor o administrador');
    }
    this.limiter.succeed(key);
    return user!.id;
  }

  /** Valida las credenciales de un supervisor sin ejecutar ninguna acción (para dar respuesta inmediata en pantalla). */
  async verifyAuthorization(userId: number, a: Authorization) {
    await this.authorize(userId, a);
    return { ok: true };
  }

  // ---------- ventas ----------
  async createSale(
    userId: number,
    dto: {
      clientOpId?: string;
      items: SaleLineInput[];
      customerId?: number;
      paymentMethod: SalePayment;
      received?: number;
      discountPercent?: number;
      discountAmount?: number;
      authorization?: Authorization;
    },
  ) {
    if (dto.clientOpId) {
      const dup = await this.prisma.sale.findUnique({ where: { clientOpId: dto.clientOpId } });
      if (dup) return this.getSale(dup.id);
    }
    const shift = await this.requireShift(userId);
    if (!dto.items.length) throw new BadRequestException('Agrega al menos un producto');

    const products = await this.prisma.product.findMany({
      where: { id: { in: dto.items.map((i) => i.productId) }, active: true },
      include: { presentations: true },
    });
    const lines = dto.items.map((i) => {
      const p = products.find((x) => x.id === i.productId);
      if (!p) throw new BadRequestException('Producto no disponible');
      const pr = i.presentationId ? p.presentations.find((x) => x.id === i.presentationId) : null;
      if (i.presentationId && !pr) throw new BadRequestException(`Presentación inválida para ${p.code}`);
      const factor = pr ? num(pr.factor) : 1;
      const unitPrice = pr ? (pr.salePrice !== null ? num(pr.salePrice) : r2(num(p.salePrice) * factor)) : num(p.salePrice);
      return {
        p,
        productId: p.id,
        presentation: pr ? pr.name : p.unit === 'kg' ? 'Granel · kg' : p.unit,
        factor,
        quantity: i.quantity,
        unitPrice,
        total: r2(i.quantity * unitPrice),
        kg: r3(i.quantity * factor),
      };
    });
    const subtotal = r2(lines.reduce((a, l) => a + l.total, 0));

    let discountAmount = 0;
    if ((dto.discountPercent ?? 0) > 0) discountAmount = r2((subtotal * Math.min(dto.discountPercent!, 100)) / 100);
    else if ((dto.discountAmount ?? 0) > 0) discountAmount = r2(Math.min(dto.discountAmount!, subtotal));
    const discountAuthorizedById = discountAmount > 0 ? await this.authorize(userId, dto.authorization) : null;
    const total = r2(subtotal - discountAmount);

    let received: number | null = total;
    let change: number | null = null;
    let status: 'PAGADA' | 'POR_COBRAR' = 'PAGADA';
    let balance = 0;
    let dueDate: Date | null = null;
    if (dto.paymentMethod === 'EFECTIVO') {
      received = dto.received ?? total;
      if (received < total) throw new BadRequestException('El efectivo recibido no cubre el total');
      change = r2(received - total);
    } else if (dto.paymentMethod === 'CREDITO') {
      if (!dto.customerId) throw new BadRequestException('Selecciona un cliente para vender a crédito');
      const credit = await this.creditOf(dto.customerId);
      if (credit.blocked) throw new BadRequestException(`Crédito bloqueado: ${credit.reason}`);
      if (total > credit.available) throw new BadRequestException(`La venta excede el crédito disponible (${money(credit.available)})`);
      status = 'POR_COBRAR';
      balance = total;
      received = null;
      dueDate = addDays(businessDate(), credit.creditDays);
    }

    const saleId = await this.prisma.$transaction(
      async (tx) => {
        await lockShift(tx, shift.id, 'SHARE');
        if (dto.paymentMethod === 'CREDITO') {
          // Revalida con el cliente bloqueado: dos ventas a crédito simultáneas no pueden rebasar el límite.
          await lockRow(tx, 'Customer', dto.customerId!);
          const credit = await this.creditOf(dto.customerId!, tx);
          if (credit.blocked) throw new BadRequestException(`Crédito bloqueado: ${credit.reason}`);
          if (total > credit.available) throw new BadRequestException(`La venta excede el crédito disponible (${money(credit.available)})`);
        }
        await this.inventory.lockProducts(
          lines.map((l) => l.productId),
          tx,
        );
        const sale = await tx.sale.create({
          data: {
            shiftId: shift.id,
            cashierId: userId,
            customerId: dto.customerId ?? null,
            status,
            paymentMethod: dto.paymentMethod,
            subtotal,
            discountAmount,
            total,
            received,
            change,
            balance,
            dueDate,
            discountAuthorizedById,
            clientOpId: dto.clientOpId,
          },
        });
        for (const l of lines) {
          const item = await tx.saleItem.create({
            data: {
              saleId: sale.id,
              productId: l.productId,
              presentation: l.presentation,
              factor: l.factor,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              total: l.total,
            },
          });
          let consumed;
          try {
            consumed = await this.inventory.removeStock(
              { productId: l.productId, quantity: l.kg, type: 'SALIDA_VENTA', reason: `Venta folio ${sale.folio}`, refType: 'Venta', refId: sale.id, userId },
              tx,
            );
          } catch (e) {
            if (e instanceof BadRequestException) throw new BadRequestException(`${l.p.name}: ${e.message}`);
            throw e;
          }
          const cost = consumed.reduce((a, c) => a + c.quantity * c.unitCost, 0);
          await tx.saleItem.update({ where: { id: item.id }, data: { costTotal: r2(cost) } });
        }
        return sale.id;
      },
      { timeout: 20000 },
    );
    return this.getSale(saleId);
  }

  private async mapSale(id: number) {
    const s = await this.prisma.sale.findUnique({
      where: { id },
      include: { customer: true, items: { include: { product: true }, orderBy: { id: 'asc' } }, creditNotes: { orderBy: { id: 'asc' } }, shift: true },
    });
    if (!s) throw new NotFoundException('Venta no encontrada');
    const cashier = await this.prisma.user.findUnique({ where: { id: s.cashierId } });
    return {
      id: s.id,
      folio: s.folio,
      createdAt: s.createdAt,
      status: s.status,
      paymentMethod: s.paymentMethod,
      customer: s.customer ? { id: s.customer.id, name: s.customer.name } : null,
      subtotal: num(s.subtotal),
      discountAmount: num(s.discountAmount),
      total: num(s.total),
      received: s.received === null ? null : num(s.received),
      change: s.change === null ? null : num(s.change),
      balance: num(s.balance),
      dueDate: s.dueDate,
      cancelReason: s.cancelReason,
      cashier: cashier?.fullName ?? '',
      register: s.shift.register,
      items: s.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        code: i.product.code,
        name: i.product.name,
        presentation: i.presentation,
        factor: num(i.factor),
        quantity: num(i.quantity),
        unitPrice: num(i.unitPrice),
        total: num(i.total),
        returnedQty: num(i.returnedQty),
      })),
      creditNotes: s.creditNotes.map((n) => ({ id: n.id, folio: n.folio, total: num(n.total), refundMethod: n.refundMethod, createdAt: n.createdAt })),
    };
  }

  async getSale(id: number) {
    return { ...(await this.mapSale(id)), store: STORE };
  }

  async saleByFolio(folio: number) {
    const s = await this.prisma.sale.findUnique({ where: { folio } });
    if (!s) throw new NotFoundException(`No existe la venta con folio ${folio}`);
    return this.getSale(s.id);
  }

  async listSales(q?: string, status?: string, register?: string) {
    const folio = q && /^\d+$/.test(q) ? Number(q) : undefined;
    const rows = await this.prisma.sale.findMany({
      where: {
        createdAt: { gte: startOfToday() },
        ...(status ? { status: status as any } : {}),
        ...(register ? { shift: { register } } : {}),
        ...(q ? { OR: [...(folio ? [{ folio }] : []), { customer: { name: { contains: q, mode: 'insensitive' as const } } }] } : {}),
      },
      include: { customer: true, shift: { select: { register: true } } },
      orderBy: { id: 'desc' },
      take: 100,
    });
    const cashiers = new Map(
      (await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((s) => s.cashierId))] } }, select: { id: true, fullName: true } })).map(
        (u) => [u.id, u.fullName],
      ),
    );
    return rows.map((s) => ({
      id: s.id,
      folio: s.folio,
      createdAt: s.createdAt,
      customer: s.customer?.name ?? 'Público general',
      paymentMethod: s.paymentMethod,
      total: num(s.total),
      status: s.status,
      register: s.shift.register,
      cashier: cashiers.get(s.cashierId) ?? '—',
    }));
  }

  async cancelSale(userId: number, saleId: number, dto: { reason: string; authorization?: Authorization }) {
    const check = (sale: { status: string; creditNotes: unknown[] } | null) => {
      if (!sale) throw new NotFoundException('Venta no encontrada');
      if (sale.status === 'CANCELADA') throw new BadRequestException('La venta ya está cancelada');
      if (sale.creditNotes.length) throw new BadRequestException('La venta tiene devoluciones; no se puede cancelar');
    };
    const found = await this.prisma.sale.findUnique({ where: { id: saleId }, include: { creditNotes: true } });
    check(found);
    const authId = await this.authorize(userId, dto.authorization);
    await this.prisma.$transaction(async (tx) => {
      // Si el turno de la venta sigue abierto se bloquea: el corte no puede calcularse a mitad de la cancelación.
      const open = await tx.cashShift.findUnique({ where: { id: found!.shiftId }, select: { status: true } });
      if (open?.status === 'ABIERTO') await lockShift(tx, found!.shiftId, 'SHARE');
      // Se vuelve a validar con la venta bloqueada: dos cancelaciones (o cancelación y devolución) a la vez no duplican inventario.
      await lockRow(tx, 'Sale', saleId);
      const sale = (await tx.sale.findUnique({ where: { id: saleId }, include: { items: true, creditNotes: true } }))!;
      check(sale);
      for (const i of sale.items) {
        const kg = r3(num(i.quantity) * num(i.factor));
        await this.inventory.addEntry(
          {
            productId: i.productId,
            quantity: kg,
            unitCost: kg ? r2(num(i.costTotal) / kg) : 0,
            type: 'ENTRADA_DEVOLUCION',
            reason: `Cancelación folio ${sale.folio}`,
            refType: 'Venta',
            refId: sale.id,
            userId,
          },
          tx,
        );
      }
      await tx.sale.update({
        where: { id: saleId },
        data: { status: 'CANCELADA', balance: 0, cancelledAt: new Date(), cancelReason: dto.reason, cancelAuthorizedById: authId },
      });
    });
    return this.getSale(saleId);
  }

  // ---------- devoluciones / nota de crédito ----------
  async createReturn(
    userId: number,
    dto: { saleId: number; items: { saleItemId: number; quantity: number }[]; reason: string; comments?: string; refundMethod?: RefundMethod },
  ) {
    const shift = await this.requireShift(userId);
    // Junta las partidas repetidas para validar la cantidad total pedida de cada una.
    const wanted = new Map<number, number>();
    for (const x of dto.items) if (x.quantity > 0) wanted.set(x.saleItemId, r3((wanted.get(x.saleItemId) ?? 0) + x.quantity));
    if (!wanted.size) throw new BadRequestException('Selecciona al menos una partida a devolver');

    const { noteId, saleFolio } = await this.prisma.$transaction(async (tx) => {
      await lockShift(tx, shift.id, 'SHARE');
      // Con la venta bloqueada, las devoluciones y cancelaciones simultáneas leen las cantidades ya devueltas.
      await lockRow(tx, 'Sale', dto.saleId);
      const sale = await tx.sale.findUnique({ where: { id: dto.saleId }, include: { items: true, creditNotes: true } });
      if (!sale) throw new NotFoundException('Venta no encontrada');
      if (sale.status === 'CANCELADA') throw new BadRequestException('La venta está cancelada');
      const net = num(sale.subtotal) > 0 ? num(sale.total) / num(sale.subtotal) : 1;

      const picked = [...wanted].map(([saleItemId, qty]) => {
        const it = sale.items.find((i) => i.id === saleItemId);
        if (!it) throw new BadRequestException('Partida inválida');
        const left = r3(num(it.quantity) - num(it.returnedQty));
        if (qty > left) throw new BadRequestException(`Solo se pueden devolver ${left} de esta partida`);
        return { it, qty, amount: r2(qty * num(it.unitPrice) * net) };
      });
      // El redondeo por partida no puede devolver más de lo que se cobró: se ajusta la última partida.
      const alreadyRefunded = sale.creditNotes.reduce((a, n) => a + num(n.total), 0);
      const remaining = r2(num(sale.total) - alreadyRefunded);
      const everythingBack = sale.items.every((i) => r3(num(i.quantity) - num(i.returnedQty) - (wanted.get(i.id) ?? 0)) <= 0);
      let total = r2(picked.reduce((a, p) => a + p.amount, 0));
      if (total > remaining || everythingBack) {
        const last = picked[picked.length - 1];
        last.amount = r2(Math.max(0, last.amount + (remaining - total)));
        total = r2(picked.reduce((a, p) => a + p.amount, 0));
      }
      const onCredit = sale.paymentMethod === 'CREDITO';
      const refundMethod: RefundMethod = onCredit ? 'SALDO_A_FAVOR' : (dto.refundMethod ?? 'EFECTIVO');

      const note = await tx.creditNote.create({
        data: { saleId: sale.id, shiftId: shift.id, total, refundMethod, reason: dto.reason, comments: dto.comments, userId },
      });
      for (const p of picked) {
        await tx.creditNoteItem.create({ data: { creditNoteId: note.id, saleItemId: p.it.id, quantity: p.qty, amount: p.amount } });
        await tx.saleItem.update({ where: { id: p.it.id }, data: { returnedQty: { increment: p.qty } } });
        const kg = r3(p.qty * num(p.it.factor));
        const totalKg = num(p.it.quantity) * num(p.it.factor);
        await this.inventory.addEntry(
          {
            productId: p.it.productId,
            quantity: kg,
            unitCost: totalKg ? r2(num(p.it.costTotal) / totalKg) : 0,
            type: 'ENTRADA_DEVOLUCION',
            reason: `Devolución folio ${sale.folio}`,
            refType: 'NotaCredito',
            refId: note.id,
            userId,
          },
          tx,
        );
      }
      if (onCredit) {
        await tx.sale.update({ where: { id: sale.id }, data: { balance: Math.max(0, r2(num(sale.balance) - total)) } });
      }
      return { noteId: note.id, saleFolio: sale.folio };
    });
    const note = await this.prisma.creditNote.findUniqueOrThrow({
      where: { id: noteId },
      include: { items: { include: { saleItem: { include: { product: true } } } } },
    });
    return {
      id: note.id,
      folio: note.folio,
      total: num(note.total),
      refundMethod: note.refundMethod,
      reason: note.reason,
      createdAt: note.createdAt,
      saleFolio,
      store: STORE,
      items: note.items.map((i) => ({
        name: i.saleItem.product.name,
        presentation: i.saleItem.presentation,
        quantity: num(i.quantity),
        amount: num(i.amount),
      })),
    };
  }
}
