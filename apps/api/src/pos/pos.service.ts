import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RefundMethod, SalePayment } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma.service';

const num = (d: Prisma.Decimal | number | null | undefined) => Number(d ?? 0);
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;
const startOfToday = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};
const money = (n: number) => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateOnly = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));

export const STORE = {
  name: 'Forrajera San Miguel',
  address: 'Av. Hidalgo 214, Tulancingo, Hgo.',
  rfc: 'XXXX000000XXX',
  phone: '775 000 0000',
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
  constructor(private prisma: PrismaService, private inventory: InventoryService) {}

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
    return this.prisma.cashShift.create({ data: { cashierId: userId, openingFloat } });
  }

  async currentShift(userId: number) {
    const shift = await this.openShiftOf(userId);
    if (!shift) return null;
    return this.shiftSummary(shift.id);
  }

  private async shiftSummary(shiftId: number) {
    const shift = await this.prisma.cashShift.findUniqueOrThrow({ where: { id: shiftId } });
    const sales = await this.prisma.sale.findMany({ where: { shiftId } });
    const notes = await this.prisma.creditNote.findMany({ where: { shiftId } });
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
        id: shift.id, register: shift.register, openedAt: shift.openedAt, closedAt: shift.closedAt, status: shift.status,
        openingFloat: num(shift.openingFloat), countedCash: shift.countedCash === null ? null : num(shift.countedCash),
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
    const sum = await this.shiftSummary(shift.id);
    const difference = r2(dto.countedCash - sum.expectedCash);
    await this.prisma.cashShift.update({
      where: { id: shift.id },
      data: {
        status: 'CERRADO', closedAt: new Date(), expectedCash: sum.expectedCash, countedCash: dto.countedCash, difference,
        notes: dto.notes, denominations: dto.denominations as Prisma.InputJsonValue | undefined,
      },
    });
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
        ? p.presentations.map((x) => ({ id: x.id as number | null, name: x.name, factor: num(x.factor), price: x.salePrice !== null ? num(x.salePrice) : r2(num(p.salePrice) * num(x.factor)) }))
        : [{ id: null, name: p.unit === 'kg' ? 'Granel · kg' : p.unit, factor: 1, price: num(p.salePrice) }];
      for (const x of pres) {
        out.push({
          key: `${p.id}-${x.id ?? 0}`, productId: p.id, presentationId: x.id, code: p.code, name: p.name, line: p.line.code,
          presentation: x.name, factor: x.factor, price: x.price, stockKg: kg, stockUnits: Math.floor(kg / x.factor), low: kg <= num(p.minStock),
        });
      }
    }
    return out;
  }

  async creditOf(customerId: number) {
    const c = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!c) throw new NotFoundException('Cliente no encontrado');
    const open = await this.prisma.sale.findMany({ where: { customerId, status: 'POR_COBRAR', balance: { gt: 0 } } });
    const today = dateOnly(new Date());
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
  private async authorize(a?: Authorization): Promise<number> {
    const user = a?.username ? await this.prisma.user.findUnique({ where: { username: a.username.trim() } }) : null;
    const ok = !!user && user.active && ['SUPERVISOR_RUTAS', 'ADMINISTRADOR'].includes(user.role) && (await bcrypt.compare(a!.password ?? '', user.passwordHash));
    if (!ok) throw new ForbiddenException('Autorización inválida: se requiere un supervisor o administrador');
    return user!.id;
  }

  /** Valida las credenciales de un supervisor sin ejecutar ninguna acción (para dar respuesta inmediata en pantalla). */
  async verifyAuthorization(a: Authorization) {
    await this.authorize(a);
    return { ok: true };
  }

  // ---------- ventas ----------
  async createSale(
    userId: number,
    dto: {
      clientOpId?: string; items: SaleLineInput[]; customerId?: number; paymentMethod: SalePayment; received?: number;
      discountPercent?: number; discountAmount?: number; authorization?: Authorization;
    },
  ) {
    if (dto.clientOpId) {
      const dup = await this.prisma.sale.findUnique({ where: { clientOpId: dto.clientOpId } });
      if (dup) return this.getSale(dup.id);
    }
    const shift = await this.requireShift(userId);
    if (!dto.items.length) throw new BadRequestException('Agrega al menos un producto');

    const products = await this.prisma.product.findMany({ where: { id: { in: dto.items.map((i) => i.productId) }, active: true }, include: { presentations: true } });
    const lines = dto.items.map((i) => {
      const p = products.find((x) => x.id === i.productId);
      if (!p) throw new BadRequestException('Producto no disponible');
      const pr = i.presentationId ? p.presentations.find((x) => x.id === i.presentationId) : null;
      if (i.presentationId && !pr) throw new BadRequestException(`Presentación inválida para ${p.code}`);
      const factor = pr ? num(pr.factor) : 1;
      const unitPrice = pr ? (pr.salePrice !== null ? num(pr.salePrice) : r2(num(p.salePrice) * factor)) : num(p.salePrice);
      return {
        p, productId: p.id, presentation: pr ? pr.name : p.unit === 'kg' ? 'Granel · kg' : p.unit, factor, quantity: i.quantity, unitPrice,
        total: r2(i.quantity * unitPrice), kg: r3(i.quantity * factor),
      };
    });
    const subtotal = r2(lines.reduce((a, l) => a + l.total, 0));

    let discountAmount = 0;
    if ((dto.discountPercent ?? 0) > 0) discountAmount = r2((subtotal * Math.min(dto.discountPercent!, 100)) / 100);
    else if ((dto.discountAmount ?? 0) > 0) discountAmount = r2(Math.min(dto.discountAmount!, subtotal));
    const discountAuthorizedById = discountAmount > 0 ? await this.authorize(dto.authorization) : null;
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
      const d = new Date();
      d.setDate(d.getDate() + credit.creditDays);
      dueDate = dateOnly(d);
    }

    const saleId = await this.prisma.$transaction(
      async (tx) => {
        const sale = await tx.sale.create({
          data: {
            shiftId: shift.id, cashierId: userId, customerId: dto.customerId ?? null, status, paymentMethod: dto.paymentMethod, subtotal, discountAmount,
            total, received, change, balance, dueDate, discountAuthorizedById, clientOpId: dto.clientOpId,
          },
        });
        for (const l of lines) {
          const item = await tx.saleItem.create({
            data: { saleId: sale.id, productId: l.productId, presentation: l.presentation, factor: l.factor, quantity: l.quantity, unitPrice: l.unitPrice, total: l.total },
          });
          let consumed;
          try {
            consumed = await this.inventory.removeStock({ productId: l.productId, quantity: l.kg, type: 'SALIDA_VENTA', reason: `Venta folio ${sale.folio}`, refType: 'Venta', refId: sale.id, userId }, tx);
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
      id: s.id, folio: s.folio, createdAt: s.createdAt, status: s.status, paymentMethod: s.paymentMethod,
      customer: s.customer ? { id: s.customer.id, name: s.customer.name } : null,
      subtotal: num(s.subtotal), discountAmount: num(s.discountAmount), total: num(s.total), received: s.received === null ? null : num(s.received),
      change: s.change === null ? null : num(s.change), balance: num(s.balance), dueDate: s.dueDate, cancelReason: s.cancelReason,
      cashier: cashier?.fullName ?? '', register: s.shift.register,
      items: s.items.map((i) => ({
        id: i.id, productId: i.productId, code: i.product.code, name: i.product.name, presentation: i.presentation, factor: num(i.factor),
        quantity: num(i.quantity), unitPrice: num(i.unitPrice), total: num(i.total), returnedQty: num(i.returnedQty),
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

  async listSales(q?: string, status?: string) {
    const folio = q && /^\d+$/.test(q) ? Number(q) : undefined;
    const rows = await this.prisma.sale.findMany({
      where: {
        createdAt: { gte: startOfToday() },
        ...(status ? { status: status as any } : {}),
        ...(q ? { OR: [...(folio ? [{ folio }] : []), { customer: { name: { contains: q, mode: 'insensitive' as const } } }] } : {}),
      },
      include: { customer: true },
      orderBy: { id: 'desc' },
      take: 100,
    });
    return rows.map((s) => ({
      id: s.id, folio: s.folio, createdAt: s.createdAt, customer: s.customer?.name ?? 'Público general', paymentMethod: s.paymentMethod,
      total: num(s.total), status: s.status,
    }));
  }

  async cancelSale(userId: number, saleId: number, dto: { reason: string; authorization?: Authorization }) {
    const sale = await this.prisma.sale.findUnique({ where: { id: saleId }, include: { items: true, creditNotes: true } });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    if (sale.status === 'CANCELADA') throw new BadRequestException('La venta ya está cancelada');
    if (sale.creditNotes.length) throw new BadRequestException('La venta tiene devoluciones; no se puede cancelar');
    const authId = await this.authorize(dto.authorization);
    await this.prisma.$transaction(async (tx) => {
      for (const i of sale.items) {
        const kg = r3(num(i.quantity) * num(i.factor));
        await this.inventory.addEntry(
          { productId: i.productId, quantity: kg, unitCost: kg ? r2(num(i.costTotal) / kg) : 0, type: 'ENTRADA_DEVOLUCION', reason: `Cancelación folio ${sale.folio}`, refType: 'Venta', refId: sale.id, userId },
          tx,
        );
      }
      await tx.sale.update({ where: { id: saleId }, data: { status: 'CANCELADA', balance: 0, cancelledAt: new Date(), cancelReason: dto.reason, cancelAuthorizedById: authId } });
    });
    return this.getSale(saleId);
  }

  // ---------- devoluciones / nota de crédito ----------
  async createReturn(
    userId: number,
    dto: { saleId: number; items: { saleItemId: number; quantity: number }[]; reason: string; comments?: string; refundMethod?: RefundMethod },
  ) {
    const shift = await this.requireShift(userId);
    const sale = await this.prisma.sale.findUnique({ where: { id: dto.saleId }, include: { items: true } });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    if (sale.status === 'CANCELADA') throw new BadRequestException('La venta está cancelada');
    const net = num(sale.subtotal) > 0 ? num(sale.total) / num(sale.subtotal) : 1;

    const picked = dto.items
      .filter((x) => x.quantity > 0)
      .map((x) => {
        const it = sale.items.find((i) => i.id === x.saleItemId);
        if (!it) throw new BadRequestException('Partida inválida');
        const left = r3(num(it.quantity) - num(it.returnedQty));
        if (x.quantity > left) throw new BadRequestException(`Solo se pueden devolver ${left} de esta partida`);
        return { it, qty: x.quantity, amount: r2(x.quantity * num(it.unitPrice) * net) };
      });
    if (!picked.length) throw new BadRequestException('Selecciona al menos una partida a devolver');
    const total = r2(picked.reduce((a, p) => a + p.amount, 0));
    const onCredit = sale.paymentMethod === 'CREDITO';
    const refundMethod: RefundMethod = onCredit ? 'SALDO_A_FAVOR' : dto.refundMethod ?? 'EFECTIVO';

    const noteId = await this.prisma.$transaction(async (tx) => {
      const note = await tx.creditNote.create({ data: { saleId: sale.id, shiftId: shift.id, total, refundMethod, reason: dto.reason, comments: dto.comments, userId } });
      for (const p of picked) {
        await tx.creditNoteItem.create({ data: { creditNoteId: note.id, saleItemId: p.it.id, quantity: p.qty, amount: p.amount } });
        await tx.saleItem.update({ where: { id: p.it.id }, data: { returnedQty: { increment: p.qty } } });
        const kg = r3(p.qty * num(p.it.factor));
        const totalKg = num(p.it.quantity) * num(p.it.factor);
        await this.inventory.addEntry(
          { productId: p.it.productId, quantity: kg, unitCost: totalKg ? r2(num(p.it.costTotal) / totalKg) : 0, type: 'ENTRADA_DEVOLUCION', reason: `Devolución folio ${sale.folio}`, refType: 'NotaCredito', refId: note.id, userId },
          tx,
        );
      }
      if (onCredit) {
        await tx.sale.update({ where: { id: sale.id }, data: { balance: Math.max(0, r2(num(sale.balance) - total)) } });
      }
      return note.id;
    });
    const note = await this.prisma.creditNote.findUniqueOrThrow({ where: { id: noteId }, include: { items: { include: { saleItem: { include: { product: true } } } } } });
    return {
      id: note.id, folio: note.folio, total: num(note.total), refundMethod: note.refundMethod, reason: note.reason, createdAt: note.createdAt,
      saleFolio: sale.folio, store: STORE,
      items: note.items.map((i) => ({ name: i.saleItem.product.name, presentation: i.saleItem.presentation, quantity: num(i.quantity), amount: num(i.amount) })),
    };
  }
}
