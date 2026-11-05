import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PurchaseStatus } from '@prisma/client';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma.service';

const num = (d: Prisma.Decimal | number | null | undefined) => Number(d ?? 0);
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;
const DAY = 86_400_000;
/** Días de anticipación con los que una cuenta por pagar se marca como “por vencer” (COM-007). */
export const DUE_SOON_DAYS = 7;

const todayUtc = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
};

export interface SupplierInput {
  name: string;
  rfc?: string;
  contact?: string;
  phone?: string;
  email?: string;
  address?: string;
  paymentDays?: number;
  lineIds?: number[];
  active?: boolean;
}

const orderInclude = {
  supplier: true,
  items: { include: { product: true }, orderBy: { id: 'asc' } },
  receipts: { include: { items: true }, orderBy: { id: 'asc' } },
  payables: true,
} satisfies Prisma.PurchaseOrderInclude;
type OrderFull = Prisma.PurchaseOrderGetPayload<{ include: typeof orderInclude }>;

/** Estado de una cuenta por pagar según su saldo y vencimiento. */
export function payableState(amount: number, paid: number, dueDate: Date, today = todayUtc()): { status: 'PAGADA' | 'VENCIDA' | 'POR_VENCER' | 'PENDIENTE'; balance: number; daysToDue: number } {
  const balance = r2(amount - paid);
  const daysToDue = Math.round((dueDate.getTime() - today.getTime()) / DAY);
  if (balance <= 0) return { status: 'PAGADA', balance: 0, daysToDue };
  if (daysToDue < 0) return { status: 'VENCIDA', balance, daysToDue };
  if (daysToDue <= DUE_SOON_DAYS) return { status: 'POR_VENCER', balance, daysToDue };
  return { status: 'PENDIENTE', balance, daysToDue };
}

/** Cantidad sugerida: lo que falta para llegar al doble del mínimo, descontando lo ya pedido (COM-005). */
export function suggestedQuantity(minStock: number, stock: number, onOrder: number): number {
  return Math.max(0, Math.ceil(minStock * 2 - stock - onOrder));
}

@Injectable()
export class PurchasingService {
  constructor(private prisma: PrismaService, private inventory: InventoryService) {}

  // ---------- Catálogos para los formularios ----------

  async options() {
    const [suppliers, lines, stock, products] = await Promise.all([
      this.listSuppliers(),
      this.prisma.productLine.findMany({ orderBy: { name: 'asc' } }),
      this.inventory.current(),
      this.prisma.product.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    ]);
    const stockMap = new Map(stock.map((s) => [s.id, s]));
    return {
      suppliers: suppliers.filter((s) => s.active),
      lines: lines.map((l) => ({ id: l.id, code: l.code, name: l.name })),
      products: products.map((p) => ({
        id: p.id, code: p.code, name: p.name, unit: p.unit, lineId: p.lineId, purchasePrice: num(p.purchasePrice),
        stock: stockMap.get(p.id)?.stock ?? 0, minStock: num(p.minStock),
      })),
    };
  }

  // ---------- COM-001: proveedores ----------

  private mapSupplier(s: Prisma.SupplierGetPayload<{ include: { lines: true } }>) {
    return {
      id: s.id, name: s.name, rfc: s.rfc, contact: s.contact, phone: s.phone, email: s.email, address: s.address,
      paymentDays: s.paymentDays, active: s.active, lines: s.lines.map((l) => ({ id: l.id, code: l.code, name: l.name })),
    };
  }

  async listSuppliers() {
    const rows = await this.prisma.supplier.findMany({ include: { lines: true }, orderBy: { name: 'asc' } });
    return rows.map((s) => this.mapSupplier(s));
  }

  private async checkLines(lineIds: number[] | undefined) {
    if (!lineIds?.length) return;
    const found = await this.prisma.productLine.count({ where: { id: { in: lineIds } } });
    if (found !== new Set(lineIds).size) throw new BadRequestException('Hay una línea de producto que no existe');
  }

  private async assertUniqueRfc(rfc: string | undefined, exceptId?: number) {
    if (!rfc) return;
    const dup = await this.prisma.supplier.findFirst({ where: { rfc, ...(exceptId ? { id: { not: exceptId } } : {}) } });
    if (dup) throw new ConflictException(`El RFC ${rfc} ya está registrado con el proveedor “${dup.name}”`);
  }

  async createSupplier(dto: SupplierInput) {
    const rfc = dto.rfc?.trim().toUpperCase() || undefined;
    await this.checkLines(dto.lineIds);
    await this.assertUniqueRfc(rfc);
    const s = await this.prisma.supplier.create({
      data: {
        name: dto.name.trim(), rfc, contact: dto.contact?.trim() || null, phone: dto.phone?.trim() || null, email: dto.email?.trim() || null,
        address: dto.address?.trim() || null, paymentDays: dto.paymentDays ?? 0,
        lines: { connect: (dto.lineIds ?? []).map((id) => ({ id })) },
      },
      include: { lines: true },
    });
    return this.mapSupplier(s);
  }

  async updateSupplier(id: number, dto: SupplierInput) {
    if (!(await this.prisma.supplier.findUnique({ where: { id } }))) throw new NotFoundException('Proveedor no encontrado');
    const rfc = dto.rfc?.trim().toUpperCase() || undefined;
    await this.checkLines(dto.lineIds);
    await this.assertUniqueRfc(rfc, id);
    const s = await this.prisma.supplier.update({
      where: { id },
      data: {
        name: dto.name.trim(), rfc: rfc ?? null, contact: dto.contact?.trim() || null, phone: dto.phone?.trim() || null, email: dto.email?.trim() || null,
        address: dto.address?.trim() || null, paymentDays: dto.paymentDays ?? 0, active: dto.active,
        lines: { set: (dto.lineIds ?? []).map((lid) => ({ id: lid })) },
      },
      include: { lines: true },
    });
    return this.mapSupplier(s);
  }

  // ---------- COM-002: órdenes de compra ----------

  private mapOrder(o: OrderFull) {
    const items = o.items.map((i) => {
      const ordered = num(i.quantity);
      const received = num(i.receivedQty);
      return {
        id: i.id, productId: i.productId, code: i.product.code, name: i.product.name, unit: i.product.unit,
        ordered, received, pending: r3(Math.max(0, ordered - received)), unitCost: num(i.unitCost), subtotal: r2(ordered * num(i.unitCost)),
      };
    });
    const today = todayUtc();
    return {
      id: o.id, folio: o.folio, status: o.status,
      supplier: { id: o.supplier.id, name: o.supplier.name, paymentDays: o.supplier.paymentDays },
      expectedAt: o.expectedAt, notes: o.notes, createdAt: o.createdAt, sentAt: o.sentAt, closedAt: o.closedAt,
      total: r2(items.reduce((a, i) => a + i.subtotal, 0)),
      receivedTotal: r2(items.reduce((a, i) => a + i.received * i.unitCost, 0)),
      items,
      // COM-003: lo que quedó sin llegar cuando la orden se cerró con faltante
      shortage: o.status === 'RECIBIDA' ? items.filter((i) => i.pending > 0).map((i) => ({ productId: i.productId, name: i.name, missing: i.pending })) : [],
      receipts: o.receipts.map((r) => ({
        id: r.id, createdAt: r.createdAt, notes: r.notes,
        items: r.items.map((ri) => ({ orderItemId: ri.orderItemId, quantity: num(ri.quantity), note: ri.note })),
      })),
      payables: o.payables.map((p) => ({ id: p.id, amount: num(p.amount), dueDate: p.dueDate, ...payableState(num(p.amount), num(p.paidAmount), p.dueDate, today) })),
    };
  }

  private async fullOrder(id: number) {
    const o = await this.prisma.purchaseOrder.findUnique({ where: { id }, include: orderInclude });
    if (!o) throw new NotFoundException('Orden de compra no encontrada');
    return o;
  }

  async getOrder(id: number) {
    return this.mapOrder(await this.fullOrder(id));
  }

  async listOrders(filter: { status?: PurchaseStatus; supplierId?: number }) {
    const rows = await this.prisma.purchaseOrder.findMany({
      where: { status: filter.status, supplierId: filter.supplierId },
      include: orderInclude,
      orderBy: { id: 'desc' },
      take: 300,
    });
    return rows.map((o) => {
      const m = this.mapOrder(o);
      return { id: m.id, folio: m.folio, status: m.status, supplier: m.supplier, createdAt: m.createdAt, expectedAt: m.expectedAt, total: m.total, receivedTotal: m.receivedTotal, itemCount: m.items.length };
    });
  }

  async createOrder(dto: { supplierId: number; expectedAt?: string; notes?: string; items: { productId: number; quantity: number; unitCost: number }[] }, userId: number) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
    if (!supplier || !supplier.active) throw new BadRequestException('Elige un proveedor activo');
    const ids = dto.items.map((i) => i.productId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Un producto aparece dos veces en la orden');
    const products = await this.prisma.product.findMany({ where: { id: { in: ids }, active: true } });
    if (products.length !== ids.length) throw new BadRequestException('Hay un producto que no existe o está inactivo');
    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.purchaseOrder.create({
        data: {
          folio: `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`, supplierId: supplier.id, expectedAt: dto.expectedAt ? new Date(dto.expectedAt) : null,
          notes: dto.notes?.trim() || null, createdBy: userId,
          items: { create: dto.items.map((i) => ({ productId: i.productId, quantity: i.quantity, unitCost: i.unitCost })) },
        },
      });
      return tx.purchaseOrder.update({ where: { id: created.id }, data: { folio: `OC-${String(created.id).padStart(5, '0')}` } });
    });
    return this.getOrder(order.id);
  }

  async send(id: number) {
    const o = await this.fullOrder(id);
    if (o.status !== 'BORRADOR') throw new BadRequestException('Solo se puede enviar una orden en borrador');
    await this.prisma.purchaseOrder.update({ where: { id }, data: { status: 'ENVIADA', sentAt: new Date() } });
    return this.getOrder(id);
  }

  async cancel(id: number) {
    const o = await this.fullOrder(id);
    if (o.status === 'CANCELADA') return this.mapOrder(o);
    if (o.receipts.length || o.status === 'PARCIAL' || o.status === 'RECIBIDA') throw new BadRequestException('La orden ya recibió mercancía; ciérrala con el faltante en lugar de cancelarla');
    await this.prisma.purchaseOrder.update({ where: { id }, data: { status: 'CANCELADA', closedAt: new Date() } });
    return this.getOrder(id);
  }

  // ---------- COM-003: recepción parcial con diferencias ----------

  /** Registra lo que llegó: da entrada al inventario con el costo pactado y genera la cuenta por pagar. */
  async receive(id: number, dto: { notes?: string; closeShort?: boolean; items: { orderItemId: number; quantity: number; note?: string }[] }, userId: number) {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.findUnique({ where: { id }, include: { supplier: true, items: true } });
      if (!order) throw new NotFoundException('Orden de compra no encontrada');
      if (order.status !== 'ENVIADA' && order.status !== 'PARCIAL') throw new BadRequestException('Solo se recibe mercancía de órdenes enviadas o con recepción parcial');
      const lines = dto.items.map((x) => {
        const item = order.items.find((i) => i.id === x.orderItemId);
        if (!item) throw new BadRequestException('Hay un producto que no pertenece a esta orden');
        const pending = r3(num(item.quantity) - num(item.receivedQty));
        if (x.quantity > pending) throw new BadRequestException(`Se esperaban como máximo ${pending} y se intentó recibir ${x.quantity}; registra el excedente como ajuste de inventario`);
        return { item, quantity: r3(x.quantity), note: x.note?.trim() || null };
      });
      const arrived = lines.filter((l) => l.quantity > 0);
      if (!arrived.length) throw new BadRequestException('Indica al menos un producto recibido');
      const receipt = await tx.purchaseReceipt.create({
        data: {
          orderId: id, notes: dto.notes?.trim() || null, receivedBy: userId,
          items: { create: lines.filter((l) => l.quantity > 0 || l.note).map((l) => ({ orderItemId: l.item.id, quantity: l.quantity, note: l.note })) },
        },
      });
      let amount = 0;
      for (const l of arrived) {
        await tx.purchaseOrderItem.update({ where: { id: l.item.id }, data: { receivedQty: { increment: l.quantity } } });
        await this.inventory.addEntry(
          { productId: l.item.productId, quantity: l.quantity, unitCost: num(l.item.unitCost), type: 'ENTRADA_COMPRA', reason: `Recepción ${order.folio}`, refType: 'OrdenCompra', refId: id, userId },
          tx,
        );
        amount += l.quantity * num(l.item.unitCost);
      }
      const today = todayUtc();
      await tx.payable.create({
        data: {
          supplierId: order.supplierId, orderId: id, receiptId: receipt.id, amount: r2(amount),
          dueDate: new Date(today.getTime() + order.supplier.paymentDays * DAY),
        },
      });
      const stillPending = order.items.some((i) => {
        const got = arrived.find((l) => l.item.id === i.id)?.quantity ?? 0;
        return num(i.quantity) - num(i.receivedQty) - got > 0.0004;
      });
      const closed = !stillPending || !!dto.closeShort;
      await tx.purchaseOrder.update({ where: { id }, data: { status: closed ? 'RECIBIDA' : 'PARCIAL', closedAt: closed ? new Date() : null } });
    });
    return this.getOrder(id);
  }

  // ---------- COM-004: historial y comparativa de precios ----------

  async priceHistory(filter: { productId?: number; supplierId?: number }) {
    const items = await this.prisma.purchaseOrderItem.findMany({
      where: { productId: filter.productId, order: { supplierId: filter.supplierId, status: { in: ['ENVIADA', 'PARCIAL', 'RECIBIDA'] } } },
      include: { product: true, order: { include: { supplier: true } } },
      orderBy: { id: 'desc' },
      take: 1000,
    });
    const rows = items.map((i) => ({
      date: i.order.sentAt ?? i.order.createdAt, folio: i.order.folio, supplierId: i.order.supplierId, supplier: i.order.supplier.name,
      productId: i.productId, code: i.product.code, product: i.product.name, quantity: num(i.quantity), unitCost: num(i.unitCost),
    }));
    // por producto y proveedor: último, mínimo, máximo y promedio ponderado por cantidad
    const groups = new Map<string, typeof rows>();
    for (const r of rows) groups.set(`${r.productId}:${r.supplierId}`, [...(groups.get(`${r.productId}:${r.supplierId}`) ?? []), r]);
    const comparison = [...groups.values()].map((g) => {
      const qty = g.reduce((a, r) => a + r.quantity, 0);
      return {
        productId: g[0].productId, code: g[0].code, product: g[0].product, supplierId: g[0].supplierId, supplier: g[0].supplier, purchases: g.length,
        last: g[0].unitCost, min: Math.min(...g.map((r) => r.unitCost)), max: Math.max(...g.map((r) => r.unitCost)),
        average: qty > 0 ? r2(g.reduce((a, r) => a + r.unitCost * r.quantity, 0) / qty) : g[0].unitCost,
      };
    });
    comparison.sort((a, b) => a.product.localeCompare(b.product) || a.last - b.last);
    return { rows, comparison };
  }

  // ---------- COM-005: sugerencias de compra ----------

  async suggestions() {
    const [stock, pendingItems] = await Promise.all([
      this.inventory.current(),
      this.prisma.purchaseOrderItem.findMany({ where: { order: { status: { in: ['ENVIADA', 'PARCIAL'] } } }, include: { order: true } }),
    ]);
    const onOrder = new Map<number, number>();
    for (const i of pendingItems) onOrder.set(i.productId, (onOrder.get(i.productId) ?? 0) + Math.max(0, num(i.quantity) - num(i.receivedQty)));
    const low = stock.filter((p) => p.minStock > 0 && p.stock + (onOrder.get(p.id) ?? 0) <= p.minStock);
    if (!low.length) return [];
    const products = await this.prisma.product.findMany({ where: { id: { in: low.map((p) => p.id) } } });
    const last = await this.prisma.purchaseOrderItem.findMany({
      where: { productId: { in: low.map((p) => p.id) }, order: { status: { in: ['ENVIADA', 'PARCIAL', 'RECIBIDA'] }, supplier: { active: true } } },
      include: { order: { include: { supplier: true } } },
      orderBy: { id: 'desc' },
    });
    const suppliers = await this.prisma.supplier.findMany({ where: { active: true }, include: { lines: true }, orderBy: { name: 'asc' } });
    return low
      .map((p) => {
        const prod = products.find((x) => x.id === p.id)!;
        const prev = last.find((l) => l.productId === p.id);
        const supplier = prev?.order.supplier ?? suppliers.find((s) => s.lines.some((l) => l.id === prod.lineId));
        const pendingQty = onOrder.get(p.id) ?? 0;
        return {
          productId: p.id, code: p.code, name: p.name, unit: p.unit, stock: p.stock, minStock: p.minStock, onOrder: pendingQty,
          quantity: suggestedQuantity(p.minStock, p.stock, pendingQty),
          unitCost: prev ? num(prev.unitCost) : num(prod.purchasePrice),
          supplier: supplier ? { id: supplier.id, name: supplier.name } : null,
        };
      })
      .filter((s) => s.quantity > 0)
      .sort((a, b) => a.stock / (a.minStock || 1) - b.stock / (b.minStock || 1));
  }

  // ---------- COM-006 y COM-007: cuentas por pagar ----------

  private mapPayable(p: Prisma.PayableGetPayload<{ include: { supplier: true; order: true } }>, today: Date) {
    const amount = num(p.amount);
    return {
      id: p.id, supplierId: p.supplierId, supplier: p.supplier.name, orderId: p.orderId, folio: p.order.folio,
      amount, paidAmount: num(p.paidAmount), dueDate: p.dueDate, paidAt: p.paidAt, createdAt: p.createdAt, ...payableState(amount, num(p.paidAmount), p.dueDate, today),
    };
  }

  async payables(filter: { status?: string; supplierId?: number }) {
    const rows = await this.prisma.payable.findMany({ where: { supplierId: filter.supplierId }, include: { supplier: true, order: true }, orderBy: [{ dueDate: 'asc' }, { id: 'asc' }], take: 500 });
    const today = todayUtc();
    const list = rows.map((p) => this.mapPayable(p, today));
    const open = list.filter((p) => p.status !== 'PAGADA');
    const items = filter.status && filter.status !== 'TODAS' ? list.filter((p) => (filter.status === 'ABIERTAS' ? p.status !== 'PAGADA' : p.status === filter.status)) : list;
    return {
      items,
      totals: {
        open: r2(open.reduce((a, p) => a + p.balance, 0)),
        overdue: r2(open.filter((p) => p.status === 'VENCIDA').reduce((a, p) => a + p.balance, 0)),
        dueSoon: r2(open.filter((p) => p.status === 'POR_VENCER').reduce((a, p) => a + p.balance, 0)),
      },
    };
  }

  async pay(id: number, amount: number) {
    await this.prisma.$transaction(async (tx) => {
      const p = await tx.payable.findUnique({ where: { id } });
      if (!p) throw new NotFoundException('Cuenta por pagar no encontrada');
      const balance = r2(num(p.amount) - num(p.paidAmount));
      if (balance <= 0) throw new BadRequestException('La cuenta ya está pagada');
      if (amount > balance) throw new BadRequestException(`El pago excede el saldo pendiente ($${balance.toFixed(2)})`);
      const paid = r2(num(p.paidAmount) + amount);
      await tx.payable.update({ where: { id }, data: { paidAmount: paid, paidAt: paid >= num(p.amount) ? new Date() : null } });
    });
    const p = await this.prisma.payable.findUniqueOrThrow({ where: { id }, include: { supplier: true, order: true } });
    return this.mapPayable(p, todayUtc());
  }

  /** Avisos para el tablero: pagos vencidos o por vencer, y productos que necesitan reabastecerse. */
  async alerts() {
    const { items, totals } = await this.payables({ status: 'ABIERTAS' });
    const suggestions = await this.suggestions();
    return {
      overdue: items.filter((p) => p.status === 'VENCIDA'),
      dueSoon: items.filter((p) => p.status === 'POR_VENCER'),
      totals,
      toReorder: suggestions.length,
    };
  }
}
