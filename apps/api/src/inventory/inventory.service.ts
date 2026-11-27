import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MovementType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

type Tx = Prisma.TransactionClient;

export interface EntryInput {
  productId: number;
  quantity: number;
  unitCost: number;
  type?: MovementType;
  expiresAt?: Date;
  reason?: string;
  refType?: string;
  refId?: number;
  userId?: number;
}

export interface ExitInput {
  productId: number;
  quantity: number;
  type: MovementType;
  reason?: string;
  refType?: string;
  refId?: number;
  userId?: number;
}

/** Único punto por el que cambia el stock: crea lotes (entradas) y consume PEPS (salidas). */
@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async addEntry(input: EntryInput, tx?: Tx) {
    if (input.quantity <= 0) throw new BadRequestException('La cantidad debe ser mayor a 0');
    const run = async (t: Tx) => {
      const lot = await t.stockLot.create({
        data: { productId: input.productId, quantity: input.quantity, unitCost: input.unitCost, expiresAt: input.expiresAt },
      });
      await t.inventoryMovement.create({
        data: {
          productId: input.productId,
          lotId: lot.id,
          type: input.type ?? 'ENTRADA_COMPRA',
          quantity: input.quantity,
          reason: input.reason,
          refType: input.refType,
          refId: input.refId,
          userId: input.userId,
        },
      });
      return lot;
    };
    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  /**
   * Bloquea las filas de los productos hasta que termine la transacción, para que dos ventas
   * simultáneas no lean la misma existencia. Siempre en orden de id: así dos transacciones con
   * los mismos productos no se esperan mutuamente (deadlock).
   */
  async lockProducts(productIds: number[], tx: Tx) {
    const ids = [...new Set(productIds)].sort((a, b) => a - b);
    if (ids.length) await tx.$queryRaw`SELECT id FROM "Product" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
  }

  /** Descuenta PEPS (lote más antiguo primero). Falla si no hay existencia suficiente. */
  async removeStock(input: ExitInput, tx?: Tx) {
    if (input.quantity <= 0) throw new BadRequestException('La cantidad debe ser mayor a 0');
    const run = async (t: Tx) => {
      await this.lockProducts([input.productId], t);
      const lots = await t.stockLot.findMany({
        where: { productId: input.productId, quantity: { gt: 0 } },
        orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
      });
      let pending = input.quantity;
      const consumed: { lotId: number; quantity: number; unitCost: number }[] = [];
      for (const lot of lots) {
        if (pending <= 0) break;
        const take = Math.min(Number(lot.quantity), pending);
        await t.stockLot.update({ where: { id: lot.id }, data: { quantity: { decrement: take } } });
        await t.inventoryMovement.create({
          data: {
            productId: input.productId,
            lotId: lot.id,
            type: input.type,
            quantity: -take,
            reason: input.reason,
            refType: input.refType,
            refId: input.refId,
            userId: input.userId,
          },
        });
        consumed.push({ lotId: lot.id, quantity: take, unitCost: Number(lot.unitCost) });
        pending = Math.round((pending - take) * 1000) / 1000;
      }
      if (pending > 0) throw new BadRequestException(`Existencia insuficiente (faltan ${pending})`);
      return consumed;
    };
    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  async stockOf(productId: number, tx: Tx | PrismaService = this.prisma): Promise<number> {
    const r = await tx.stockLot.aggregate({ where: { productId }, _sum: { quantity: true } });
    return Number(r._sum.quantity ?? 0);
  }

  /** Ajuste manual (+/-) autorizado, siempre con motivo (INV-004, INV-007). */
  async adjust(productId: number, delta: number, reason: string, userId: number) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    if (delta === 0) throw new BadRequestException('El ajuste no puede ser 0');
    if (delta > 0) {
      await this.addEntry({ productId, quantity: delta, unitCost: Number(product.purchasePrice), type: 'ENTRADA_AJUSTE', reason, userId });
    } else {
      await this.removeStock({ productId, quantity: -delta, type: 'SALIDA_AJUSTE', reason, userId });
    }
    return { productId, stock: await this.stockOf(productId) };
  }

  /** INV-005: inventario actual, opcionalmente filtrado por línea. */
  async current(lineCode?: string) {
    const products = await this.prisma.product.findMany({
      where: { active: true, ...(lineCode ? { line: { code: lineCode.toUpperCase() } } : {}) },
      include: { line: true },
      orderBy: { name: 'asc' },
    });
    const lots = await this.prisma.stockLot.findMany({ where: { quantity: { gt: 0 } }, select: { productId: true, quantity: true, unitCost: true } });
    const map = new Map<number, { stock: number; value: number }>();
    for (const l of lots) {
      const cur = map.get(l.productId) ?? { stock: 0, value: 0 };
      cur.stock += Number(l.quantity);
      cur.value += Number(l.quantity) * Number(l.unitCost);
      map.set(l.productId, cur);
    }
    return products.map((p) => {
      const stock = Math.round((map.get(p.id)?.stock ?? 0) * 1000) / 1000;
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        line: p.line.code,
        lineName: p.line.name,
        unit: p.unit,
        stock,
        minStock: Number(p.minStock),
        low: stock <= Number(p.minStock),
        purchasePrice: Number(p.purchasePrice),
        /** lo que costó la existencia actual, lote por lote */
        value: Math.round((map.get(p.id)?.value ?? 0) * 100) / 100,
      };
    });
  }

  /** INV-003: productos en o bajo el mínimo configurado. */
  async alerts() {
    return (await this.current()).filter((p) => p.low && p.minStock > 0);
  }

  /** INV-007: historial de movimientos, con el nombre de quien lo hizo. */
  async movements(filter: { productId?: number; from?: Date; to?: Date }) {
    const rows = await this.prisma.inventoryMovement.findMany({
      where: {
        productId: filter.productId,
        createdAt: { gte: filter.from, lte: filter.to },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const ids = [...new Set(rows.flatMap((r) => (r.userId ? [r.userId] : [])))];
    const names = new Map(
      (await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })).map((u) => [u.id, u.fullName]),
    );
    return rows.map((r) => ({ ...r, quantity: Number(r.quantity), user: r.userId ? (names.get(r.userId) ?? null) : null }));
  }

  /** INV-008: rotación = salidas por venta del período / existencia actual, por producto y por línea. */
  async rotation(from: Date, to: Date) {
    const sold = await this.prisma.inventoryMovement.groupBy({
      by: ['productId'],
      where: { type: 'SALIDA_VENTA', createdAt: { gte: from, lte: to } },
      _sum: { quantity: true },
    });
    const soldMap = new Map(sold.map((s) => [s.productId, -Number(s._sum.quantity ?? 0)]));
    const rows = (await this.current()).map((p) => {
      const out = soldMap.get(p.id) ?? 0;
      return { code: p.code, name: p.name, line: p.line, sold: out, stock: p.stock, rotation: p.stock > 0 ? +(out / p.stock).toFixed(2) : null };
    });
    const byLine: Record<string, { sold: number; stock: number }> = {};
    for (const r of rows) {
      byLine[r.line] ??= { sold: 0, stock: 0 };
      byLine[r.line].sold += r.sold;
      byLine[r.line].stock += r.stock;
    }
    return {
      byProduct: rows,
      byLine: Object.entries(byLine).map(([line, v]) => ({ line, ...v, rotation: v.stock > 0 ? +(v.sold / v.stock).toFixed(2) : null })),
    };
  }
}
