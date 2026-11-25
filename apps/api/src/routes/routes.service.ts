import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PosService } from '../pos/pos.service';
import { PrismaService } from '../prisma.service';
import { atBusinessTime, businessDate } from '../common/time';
import { speedKmh } from './live';

const num = (d: Prisma.Decimal | number | null | undefined) => Number(d ?? 0);
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
/** Minutos de gracia sobre la hora estimada antes de contar una entrega como tardía. */
export const LATE_TOLERANCE_MIN = 15;

/** "Hoy" en la hora del negocio (no la del servidor, que está en UTC). */
const todayUtc = () => businessDate();

/** Lo que la app del chofer reportó de su conexión (POST /driver/status), para el monitoreo del supervisor. */
export const syncState = (r: { lastSeenAt: Date | null; pendingOps: number; oldestPendingAt: Date | null; rejectedOps: number; gpsStatus: string | null }) => ({
  lastSeenAt: r.lastSeenAt,
  pending: r.pendingOps,
  oldestPendingAt: r.oldestPendingAt,
  rejected: r.rejectedOps,
  gps: r.gpsStatus,
});
const parseDate = (s: string) => new Date(s + 'T00:00:00.000Z');

/** ¿Llegó/entregó después de su hora estimada + tolerancia? (eta "HH:MM" en la hora local del negocio, el día de la ruta) */
export function isLate(eta: string | null, routeDate: Date, at: Date): boolean {
  if (!eta || !/^\d{2}:\d{2}$/.test(eta)) return false;
  const [h, m] = eta.split(':').map(Number);
  const target = atBusinessTime(routeDate, h, m + LATE_TOLERANCE_MIN);
  return at.getTime() > target.getTime();
}

const rowInclude = {
  driver: true,
  vehicle: true,
  stops: { include: { items: true, customer: true, payments: true }, orderBy: { sequence: 'asc' } },
  payments: true,
} satisfies Prisma.RouteInclude;
type RouteRow = Prisma.RouteGetPayload<{ include: typeof rowInclude }>;

@Injectable()
export class RoutesService {
  constructor(
    private prisma: PrismaService,
    private pos: PosService,
  ) {}

  /** Todo lo que el formulario de “Nueva ruta” necesita elegir. */
  async options() {
    const [drivers, vehicles, customers, catalog] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: 'CHOFER', active: true },
        select: { id: true, fullName: true, username: true },
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.vehicle.findMany({ orderBy: { plate: 'asc' } }),
      this.prisma.customer.findMany({ orderBy: { name: 'asc' } }),
      this.pos.catalog(),
    ]);
    return {
      drivers,
      vehicles,
      customers: customers.map((c) => ({
        id: c.id,
        name: c.name,
        address: c.address,
        lat: c.lat,
        lng: c.lng,
        creditDays: c.creditDays,
        creditLimit: num(c.creditLimit),
      })),
      catalog,
    };
  }

  async create(dto: {
    name: string;
    date: string;
    driverId: number;
    vehicleId: number;
    plannedDeparture?: string;
    stops: {
      customerId: number;
      eta?: string;
      paymentTerms?: 'CONTADO' | 'CREDITO';
      instructions?: string;
      items: { productId: number; presentationId?: number; quantity: number }[];
    }[];
  }) {
    const driver = await this.prisma.user.findUnique({ where: { id: dto.driverId } });
    if (!driver || driver.role !== 'CHOFER' || !driver.active) throw new BadRequestException('Elige un repartidor activo');
    if (!(await this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId } }))) throw new BadRequestException('Elige un camión válido');
    const date = parseDate(dto.date);
    const busy = await this.prisma.route.findFirst({ where: { driverId: dto.driverId, date, status: { not: 'FINALIZADA' } } });
    if (busy) throw new ConflictException(`${driver.fullName} ya tiene la ruta “${busy.name}” sin finalizar ese día`);

    const customers = await this.prisma.customer.findMany({ where: { id: { in: dto.stops.map((s) => s.customerId) } } });
    const products = await this.prisma.product.findMany({
      where: { id: { in: dto.stops.flatMap((s) => s.items.map((i) => i.productId)) }, active: true },
      include: { presentations: true },
    });

    const stops = dto.stops.map((s, idx) => {
      const c = customers.find((x) => x.id === s.customerId);
      if (!c) throw new BadRequestException(`Parada ${idx + 1}: cliente inválido`);
      if (s.paymentTerms === 'CREDITO' && c.creditDays <= 0) throw new BadRequestException(`Parada ${idx + 1}: ${c.name} no tiene crédito autorizado`);
      if (!s.items.length) throw new BadRequestException(`Parada ${idx + 1}: agrega al menos un producto`);
      const items = s.items.map((i) => {
        const p = products.find((x) => x.id === i.productId);
        if (!p) throw new BadRequestException(`Parada ${idx + 1}: producto no disponible`);
        const pr = i.presentationId ? p.presentations.find((x) => x.id === i.presentationId) : null;
        if (i.presentationId && !pr) throw new BadRequestException(`Parada ${idx + 1}: presentación inválida`);
        const factor = pr ? num(pr.factor) : 1;
        const unitPrice = pr ? (pr.salePrice !== null ? num(pr.salePrice) : r2(num(p.salePrice) * factor)) : num(p.salePrice);
        return { productId: p.id, presentation: pr ? pr.name : p.unit === 'kg' ? 'Granel · kg' : p.unit, factor, quantity: i.quantity, unitPrice };
      });
      return {
        customerId: c.id,
        sequence: idx + 1,
        eta: s.eta ?? null,
        instructions: s.instructions ?? null,
        paymentTerms: s.paymentTerms === 'CREDITO' ? `Crédito ${c.creditDays} días` : 'Contado',
        items,
      };
    });

    const route = await this.prisma.route.create({
      data: {
        name: dto.name,
        date,
        driverId: dto.driverId,
        vehicleId: dto.vehicleId,
        plannedDeparture: dto.plannedDeparture ?? null,
        stops: {
          create: stops.map((s) => ({
            customerId: s.customerId,
            sequence: s.sequence,
            eta: s.eta,
            instructions: s.instructions,
            paymentTerms: s.paymentTerms,
            items: { create: s.items },
          })),
        },
      },
    });
    return this.get(route.id);
  }

  private row(r: RouteRow) {
    const stops = r.stops;
    const count = (st: string) => stops.filter((s) => s.status === st).length;
    const collected = r2(r.payments.reduce((a, p) => a + num(p.amount), 0));
    const pendingToCollect = r2(
      stops
        .filter((s) => s.status === 'PENDIENTE' && s.paymentTerms === 'Contado')
        .reduce((a, s) => a + s.items.reduce((x, i) => x + num(i.quantity) * num(i.unitPrice), 0), 0),
    );
    return {
      id: r.id,
      name: r.name,
      date: r.date.toISOString().slice(0, 10),
      status: r.status,
      driver: { id: r.driver.id, name: r.driver.fullName },
      vehicle: { plate: r.vehicle.plate, name: r.vehicle.name },
      plannedDeparture: r.plannedDeparture,
      departedAt: r.departedAt,
      returnedAt: r.returnedAt,
      stops: { total: stops.length, delivered: count('ENTREGADA'), failed: count('NO_ENTREGADA'), pending: count('PENDIENTE') },
      collected,
      pendingToCollect,
    };
  }

  async list(scope: 'today' | 'scheduled' | 'finished' = 'today') {
    const today = todayUtc();
    const where: Prisma.RouteWhereInput =
      scope === 'scheduled' ? { status: 'PROGRAMADA', date: { gte: today } } : scope === 'finished' ? { status: 'FINALIZADA' } : { date: today };
    const rows = await this.prisma.route.findMany({ where, include: rowInclude, orderBy: scope === 'finished' ? { date: 'desc' } : { id: 'desc' }, take: 60 });
    const routes = rows.map((r) => this.row(r));

    // indicadores del día
    const todayRows = scope === 'today' ? rows : await this.prisma.route.findMany({ where: { date: today }, include: rowInclude });
    const stops = todayRows.flatMap((r) => r.stops.map((s) => ({ s, r })));
    const delivered = stops.filter(({ s }) => s.status === 'ENTREGADA');
    const withRef = delivered.filter(({ s }) => s.arrivedAt ?? s.deliveredAt);
    const onTime = withRef.filter(({ s, r }) => !isLate(s.eta, r.date, (s.arrivedAt ?? s.deliveredAt)!)).length;
    const kpis = {
      routesToday: todayRows.length,
      inProgress: todayRows.filter((r) => r.status === 'EN_CURSO').length,
      scheduled: todayRows.filter((r) => r.status === 'PROGRAMADA').length,
      finished: todayRows.filter((r) => r.status === 'FINALIZADA').length,
      stopsTotal: stops.length,
      stopsDelivered: delivered.length,
      onTimePct: withRef.length ? Math.round((onTime / withRef.length) * 100) : null,
      pendingToCollect: r2(todayRows.reduce((a, r) => a + this.row(r).pendingToCollect, 0)),
      collected: r2(todayRows.reduce((a, r) => a + this.row(r).collected, 0)),
    };
    return { routes, kpis };
  }

  async get(id: number) {
    const r = await this.prisma.route.findUnique({
      where: { id },
      include: { ...rowInclude, incidents: { orderBy: { createdAt: 'desc' } } },
    });
    if (!r) throw new NotFoundException('Ruta no encontrada');
    const last = await this.prisma.locationPing.findFirst({ where: { routeId: id }, orderBy: { recordedAt: 'desc' } });
    return {
      ...this.row(r),
      lastPing: last ? { lat: last.lat, lng: last.lng, at: last.recordedAt } : null,
      stopsDetail: r.stops.map((s) => ({
        id: s.id,
        sequence: s.sequence,
        status: s.status,
        eta: s.eta,
        paymentTerms: s.paymentTerms,
        instructions: s.instructions,
        arrivedAt: s.arrivedAt,
        deliveredAt: s.deliveredAt,
        failReason: s.failReason,
        late: s.status === 'ENTREGADA' && (s.arrivedAt ?? s.deliveredAt) ? isLate(s.eta, r.date, (s.arrivedAt ?? s.deliveredAt)!) : false,
        customer: { id: s.customer.id, name: s.customer.name, address: s.customer.address, lat: s.customer.lat, lng: s.customer.lng },
        total: r2(s.items.reduce((a, i) => a + num(i.quantity) * num(i.unitPrice), 0)),
        collected: r2(s.payments.reduce((a, p) => a + num(p.amount), 0)),
        items: s.items.map((i) => ({ presentation: i.presentation, quantity: num(i.quantity), unitPrice: num(i.unitPrice) })),
      })),
      incidents: r.incidents.map((i) => ({ id: i.id, type: i.type, description: i.description, createdAt: i.createdAt })),
    };
  }

  /** Rutas en curso con su última ubicación y el recorrido reciente, para el mapa en vivo. */
  async monitor() {
    const rows = await this.prisma.route.findMany({ where: { status: 'EN_CURSO' }, include: rowInclude, orderBy: { id: 'asc' } });
    const out = [];
    for (const r of rows) {
      const pings = await this.prisma.locationPing.findMany({ where: { routeId: r.id }, orderBy: { recordedAt: 'desc' }, take: 80 });
      const ordered = [...pings].reverse();
      const last = pings[0];
      out.push({
        ...this.row(r),
        lastPing: last ? { lat: last.lat, lng: last.lng, at: last.recordedAt } : null,
        sync: syncState(r),
        speedKmh: speedKmh(ordered.map((p) => ({ lat: p.lat, lng: p.lng, at: p.recordedAt }))),
        trail: ordered.map((p) => [p.lat, p.lng]),
        stopsMap: r.stops.map((s) => ({
          id: s.id,
          sequence: s.sequence,
          status: s.status,
          eta: s.eta,
          arrivedAt: s.arrivedAt,
          deliveredAt: s.deliveredAt,
          customer: { name: s.customer.name, address: s.customer.address, lat: s.customer.lat, lng: s.customer.lng },
        })),
      });
    }
    return { now: new Date(), routes: out };
  }

  /**
   * Versión ligera de monitor() para refrescar el mapa cada pocos segundos: solo las últimas ubicaciones de cada ruta en curso.
   * El cliente las mezcla con el recorrido que ya tiene y pide monitor() completo de vez en cuando.
   */
  async live() {
    const rows = await this.prisma.route.findMany({
      where: { status: 'EN_CURSO' },
      select: {
        id: true,
        name: true,
        driver: { select: { fullName: true } },
        vehicle: { select: { plate: true } },
        lastSeenAt: true,
        pendingOps: true,
        oldestPendingAt: true,
        rejectedOps: true,
        gpsStatus: true,
      },
      orderBy: { id: 'asc' },
    });
    const routes = [];
    for (const r of rows) {
      const pings = await this.prisma.locationPing.findMany({ where: { routeId: r.id }, orderBy: { recordedAt: 'desc' }, take: 6 });
      const recent = [...pings].reverse().map((p) => ({ lat: p.lat, lng: p.lng, at: p.recordedAt }));
      routes.push({
        id: r.id,
        name: r.name,
        driver: r.driver.fullName,
        plate: r.vehicle.plate,
        lastPing: recent.length ? recent[recent.length - 1] : null,
        sync: syncState(r),
        speedKmh: speedKmh(recent),
        recent,
      });
    }
    return { now: new Date(), routes };
  }

  /** Entregas a tiempo vs. tardías, tiempos por parada, cobros y no entregas en un rango de fechas. */
  async efficiency(from?: string, to?: string) {
    const end = to ? parseDate(to) : todayUtc();
    const start = from ? parseDate(from) : new Date(end.getTime() - 6 * 86400000);
    const stops = await this.prisma.routeStop.findMany({
      where: { route: { date: { gte: start, lte: end } }, status: { in: ['ENTREGADA', 'NO_ENTREGADA'] } },
      include: { route: { include: { driver: true } } },
    });
    const payments = await this.prisma.payment.findMany({ where: { route: { date: { gte: start, lte: end } } }, include: { route: true } });

    const perDay = new Map<string, { onTime: number; late: number; failed: number }>();
    for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86400000)) perDay.set(d.toISOString().slice(0, 10), { onTime: 0, late: 0, failed: 0 });
    const perDriver = new Map<
      number,
      { name: string; routes: Set<number>; stops: number; onTime: number; late: number; failed: number; minutes: number[]; collected: number }
    >();
    const reasons: Record<string, number> = {};
    let onTime = 0,
      late = 0,
      failed = 0;
    const minutes: number[] = [];

    for (const s of stops) {
      const day = perDay.get(s.route.date.toISOString().slice(0, 10));
      const dr = perDriver.get(s.route.driverId) ?? {
        name: s.route.driver.fullName,
        routes: new Set<number>(),
        stops: 0,
        onTime: 0,
        late: 0,
        failed: 0,
        minutes: [],
        collected: 0,
      };
      dr.routes.add(s.routeId);
      dr.stops++;
      if (s.status === 'NO_ENTREGADA') {
        failed++;
        dr.failed++;
        if (day) day.failed++;
        reasons[s.failReason ?? 'OTRO'] = (reasons[s.failReason ?? 'OTRO'] ?? 0) + 1;
      } else {
        const ref = s.arrivedAt ?? s.deliveredAt;
        const lateStop = ref ? isLate(s.eta, s.route.date, ref) : false;
        if (lateStop) {
          late++;
          dr.late++;
          if (day) day.late++;
        } else {
          onTime++;
          dr.onTime++;
          if (day) day.onTime++;
        }
        if (s.arrivedAt && s.deliveredAt) {
          const m = (s.deliveredAt.getTime() - s.arrivedAt.getTime()) / 60000;
          if (m >= 0 && m < 240) {
            minutes.push(m);
            dr.minutes.push(m);
          }
        }
      }
      perDriver.set(s.route.driverId, dr);
    }
    for (const p of payments) {
      const dr = perDriver.get(p.route.driverId);
      if (dr) dr.collected = r2(dr.collected + num(p.amount));
    }
    const avg = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
    const delivered = onTime + late;
    return {
      from: start.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
      toleranceMin: LATE_TOLERANCE_MIN,
      kpis: {
        stops: stops.length,
        delivered,
        onTime,
        late,
        failed,
        onTimePct: delivered ? Math.round((onTime / delivered) * 100) : null,
        latePct: delivered ? Math.round((late / delivered) * 100) : null,
        avgMinutes: avg(minutes),
      },
      perDay: [...perDay.entries()].map(([date, v]) => ({ date, ...v })),
      perDriver: [...perDriver.entries()]
        .map(([id, v]) => ({
          driverId: id,
          name: v.name,
          routes: v.routes.size,
          stops: v.stops,
          onTime: v.onTime,
          late: v.late,
          failed: v.failed,
          onTimePct: v.onTime + v.late ? Math.round((v.onTime / (v.onTime + v.late)) * 100) : null,
          avgMinutes: avg(v.minutes),
          collected: v.collected,
        }))
        .sort((a, b) => b.stops - a.stops),
      reasons,
    };
  }
}
