import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { addDays, atBusinessTime, businessDate } from '../common/time';
import { PrismaService } from '../prisma.service';

const num = (d: Prisma.Decimal | number | null | undefined) => Number(d ?? 0);
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const METHODS = ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'CREDITO'] as const;
type ByMethod = Record<(typeof METHODS)[number], number>;
const emptyByMethod = (): ByMethod => ({ EFECTIVO: 0, TRANSFERENCIA: 0, TARJETA: 0, CREDITO: 0 });

/** "YYYY-MM-DD" → día de calendario del negocio (medianoche UTC); sin fecha, hoy. */
export function parseDay(date?: string): Date {
  if (!date) return businessDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('La fecha debe tener el formato AAAA-MM-DD');
  const d = new Date(date + 'T00:00:00.000Z');
  if (Number.isNaN(d.getTime())) throw new BadRequestException('Fecha inválida');
  return d;
}

/**
 * Lo vendido en un día: mostrador por caja (con sus turnos y cortes) y reparto por ruta. Solo para el administrador.
 * "Día" es el del negocio (APP_TIMEZONE), no el del servidor.
 */
@Injectable()
export class SalesReportService {
  constructor(private prisma: PrismaService) {}

  async daily(date?: string) {
    const day = parseDay(date);
    const from = atBusinessTime(day, 0, 0);
    const to = atBusinessTime(addDays(day, 1), 0, 0);

    const [sales, notes, shifts, routes] = await Promise.all([
      this.prisma.sale.findMany({ where: { createdAt: { gte: from, lt: to } }, include: { shift: { select: { register: true } } } }),
      this.prisma.creditNote.findMany({ where: { createdAt: { gte: from, lt: to } }, include: { shift: { select: { register: true } } } }),
      this.prisma.cashShift.findMany({
        where: { OR: [{ openedAt: { gte: from, lt: to } }, { sales: { some: { createdAt: { gte: from, lt: to } } } }] },
        include: { sales: true, creditNotes: true },
        orderBy: { openedAt: 'asc' },
      }),
      this.prisma.route.findMany({
        where: { date: day },
        include: { driver: true, vehicle: true, stops: { include: { items: true } }, payments: true },
        orderBy: { id: 'asc' },
      }),
    ]);
    const userIds = [...new Set([...sales.map((s) => s.cashierId), ...shifts.map((s) => s.cashierId)])];
    const users = new Map(
      (await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } })).map((u) => [u.id, u.fullName]),
    );

    // ---------- mostrador, por caja ----------
    const registers = new Map<
      string,
      { register: string; cashiers: Set<string>; count: number; cancelled: number; total: number; byMethod: ByMethod; refunds: number }
    >();
    const reg = (name: string) => {
      if (!registers.has(name))
        registers.set(name, { register: name, cashiers: new Set(), count: 0, cancelled: 0, total: 0, byMethod: emptyByMethod(), refunds: 0 });
      return registers.get(name)!;
    };
    for (const s of sales) {
      const g = reg(s.shift.register);
      g.cashiers.add(users.get(s.cashierId) ?? '—');
      if (s.status === 'CANCELADA') {
        g.cancelled++;
        continue;
      }
      g.count++;
      g.total = r2(g.total + num(s.total));
      g.byMethod[s.paymentMethod] = r2(g.byMethod[s.paymentMethod] + num(s.total));
    }
    for (const n of notes) {
      const g = reg(n.shift.register);
      g.refunds = r2(g.refunds + num(n.total));
    }
    const byRegister = [...registers.values()]
      .map((g) => ({ ...g, cashiers: [...g.cashiers].sort(), net: r2(g.total - g.refunds) }))
      .sort((a, b) => a.register.localeCompare(b.register, 'es', { numeric: true }));
    const counter = {
      count: byRegister.reduce((a, g) => a + g.count, 0),
      cancelled: byRegister.reduce((a, g) => a + g.cancelled, 0),
      total: r2(byRegister.reduce((a, g) => a + g.total, 0)),
      refunds: r2(byRegister.reduce((a, g) => a + g.refunds, 0)),
      byMethod: METHODS.reduce((acc, m) => ({ ...acc, [m]: r2(byRegister.reduce((a, g) => a + g.byMethod[m], 0)) }), emptyByMethod()),
    };

    // ---------- turnos y cortes ----------
    const shiftRows = shifts.map((sh) => {
      const done = sh.sales.filter((s) => s.status !== 'CANCELADA');
      const cash = done.filter((s) => s.paymentMethod === 'EFECTIVO').reduce((a, s) => a + num(s.total), 0);
      const cashRefunds = sh.creditNotes.filter((n) => n.refundMethod === 'EFECTIVO').reduce((a, n) => a + num(n.total), 0);
      // abierto: el efectivo esperado se calcula igual que en el corte; cerrado: el que quedó guardado al cerrar
      const expectedCash = sh.expectedCash !== null ? num(sh.expectedCash) : r2(num(sh.openingFloat) + cash - cashRefunds);
      return {
        id: sh.id,
        register: sh.register,
        cashier: users.get(sh.cashierId) ?? '—',
        status: sh.status,
        openedAt: sh.openedAt,
        closedAt: sh.closedAt,
        openingFloat: num(sh.openingFloat),
        salesCount: done.length,
        total: r2(done.reduce((a, s) => a + num(s.total), 0)),
        expectedCash: r2(expectedCash),
        countedCash: sh.countedCash === null ? null : num(sh.countedCash),
        difference: sh.difference === null ? null : num(sh.difference),
      };
    });

    // ---------- reparto, por ruta ----------
    const routeRows = routes.map((r) => {
      const value = (items: { quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; deliveredQty?: Prisma.Decimal }[], delivered: boolean) =>
        items.reduce((a, i) => a + (delivered ? num(i.deliveredQty) : num(i.quantity)) * num(i.unitPrice), 0);
      const deliveredStops = r.stops.filter((s) => s.status === 'ENTREGADA');
      const collected = { EFECTIVO: 0, TRANSFERENCIA: 0, TARJETA: 0 };
      for (const p of r.payments) collected[p.method] = r2(collected[p.method] + num(p.amount));
      return {
        id: r.id,
        name: r.name,
        status: r.status,
        driver: r.driver.fullName,
        plate: r.vehicle.plate,
        stops: { total: r.stops.length, delivered: deliveredStops.length, failed: r.stops.filter((s) => s.status === 'NO_ENTREGADA').length },
        planned: r2(r.stops.reduce((a, s) => a + value(s.items, false), 0)),
        delivered: r2(deliveredStops.reduce((a, s) => a + value(s.items, true), 0)),
        collected,
        collectedTotal: r2(collected.EFECTIVO + collected.TRANSFERENCIA + collected.TARJETA),
      };
    });
    const delivery = {
      routes: routeRows.length,
      delivered: r2(routeRows.reduce((a, r) => a + r.delivered, 0)),
      planned: r2(routeRows.reduce((a, r) => a + r.planned, 0)),
      collected: r2(routeRows.reduce((a, r) => a + r.collectedTotal, 0)),
      cash: r2(routeRows.reduce((a, r) => a + r.collected.EFECTIVO, 0)),
    };

    return {
      date: day.toISOString().slice(0, 10),
      total: r2(counter.total - counter.refunds + delivery.delivered),
      counter: { ...counter, byRegister },
      shifts: shiftRows,
      delivery: { ...delivery, byRoute: routeRows },
    };
  }
}
