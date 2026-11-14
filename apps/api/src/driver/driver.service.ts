import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { IncidentType, PaymentMethod, Prisma } from '@prisma/client';
import { businessDate } from '../common/time';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma.service';

const num = (d: Prisma.Decimal | number | null | undefined) => Number(d ?? 0);

const routeInclude = {
  vehicle: true,
  stops: {
    orderBy: { sequence: 'asc' },
    include: { customer: true, items: { include: { product: true }, orderBy: { id: 'asc' } } },
  },
} satisfies Prisma.RouteInclude;

type RouteFull = Prisma.RouteGetPayload<{ include: typeof routeInclude }>;

export interface PaymentInput {
  amount: number;
  method: PaymentMethod;
}

@Injectable()
export class DriverService {
  constructor(
    private prisma: PrismaService,
    private inventory: InventoryService,
  ) {}

  private mapRoute(r: RouteFull) {
    return {
      id: r.id,
      name: r.name,
      date: r.date.toISOString().slice(0, 10),
      status: r.status,
      departedAt: r.departedAt,
      returnedAt: r.returnedAt,
      plannedDeparture: r.plannedDeparture,
      vehicle: { plate: r.vehicle.plate, name: r.vehicle.name },
      stops: r.stops.map((s) => {
        const items = s.items.map((i) => ({
          id: i.id,
          productId: i.productId,
          code: i.product.code,
          name: i.product.name,
          presentation: i.presentation,
          factor: num(i.factor),
          quantity: num(i.quantity),
          deliveredQty: s.status === 'ENTREGADA' ? num(i.deliveredQty) : 0,
          unitPrice: num(i.unitPrice),
          total: num(i.quantity) * num(i.unitPrice),
        }));
        return {
          id: s.id,
          sequence: s.sequence,
          status: s.status,
          eta: s.eta,
          instructions: s.instructions,
          paymentTerms: s.paymentTerms,
          arrivedAt: s.arrivedAt,
          deliveredAt: s.deliveredAt,
          failReason: s.failReason,
          customer: {
            id: s.customer.id,
            name: s.customer.name,
            address: s.customer.address,
            phone: s.customer.phone,
            contact: s.customer.contact,
            lat: s.customer.lat,
            lng: s.customer.lng,
          },
          items,
          total: items.reduce((a, i) => a + i.total, 0),
        };
      }),
    };
  }

  private async ownedRoute(routeId: number, userId: number) {
    const route = await this.prisma.route.findUnique({ where: { id: routeId }, include: routeInclude });
    if (!route) throw new NotFoundException('Ruta no encontrada');
    if (route.driverId !== userId) throw new ForbiddenException('Esta ruta no es tuya');
    return route;
  }

  private async ownedStop(stopId: number, userId: number) {
    const stop = await this.prisma.routeStop.findUnique({ where: { id: stopId }, include: { route: true, items: true } });
    if (!stop) throw new NotFoundException('Parada no encontrada');
    if (stop.route.driverId !== userId) throw new ForbiddenException('Esta parada no es tuya');
    return stop;
  }

  /** Ruta vigente del chofer: la más reciente sin finalizar; si no hay, la finalizada de hoy. */
  async currentRoute(userId: number) {
    const today = businessDate();
    const open = await this.prisma.route.findFirst({
      where: { driverId: userId, date: { lte: today }, status: { not: 'FINALIZADA' } },
      orderBy: { date: 'desc' },
      include: routeInclude,
    });
    const route = open ?? (await this.prisma.route.findFirst({ where: { driverId: userId, date: today }, include: routeInclude }));
    if (!route) throw new NotFoundException('No tienes una ruta asignada para hoy');
    return this.mapRoute(route);
  }

  /** Carga el camión: descuenta del almacén lo que irá a bordo (queda en tránsito) y registra la salida. */
  async start(routeId: number, userId: number) {
    const route = await this.ownedRoute(routeId, userId);
    if (route.status !== 'PROGRAMADA') return this.mapRoute(route);
    const need = new Map<number, { code: string; kg: number }>();
    for (const s of route.stops)
      for (const i of s.items) {
        const cur = need.get(i.productId) ?? { code: i.product.code, kg: 0 };
        cur.kg += num(i.quantity) * num(i.factor);
        need.set(i.productId, cur);
      }
    await this.prisma.$transaction(async (tx) => {
      // Si el repartidor toca "Cargar" dos veces a la vez, solo una carga descuenta el almacén.
      const claimed = await tx.route.updateMany({ where: { id: routeId, status: 'PROGRAMADA' }, data: { status: 'EN_CURSO', departedAt: new Date() } });
      if (claimed.count === 0) return;
      await this.inventory.lockProducts([...need.keys()], tx);
      for (const [productId, n] of need) {
        try {
          await this.inventory.removeStock(
            { productId, quantity: n.kg, type: 'SALIDA_RUTA', reason: `Carga de ${route.name}`, refType: 'Ruta', refId: route.id, userId },
            tx,
          );
        } catch (e) {
          if (e instanceof BadRequestException) throw new BadRequestException(`${n.code}: ${e.message}`);
          throw e;
        }
      }
    });
    return this.mapRoute(await this.ownedRoute(routeId, userId));
  }

  /** El repartidor llegó a la parada (RUT-005). Solo guarda la primera hora de llegada. */
  async arrive(stopId: number, userId: number, at?: string) {
    const stop = await this.ownedStop(stopId, userId);
    if (stop.arrivedAt) return { ok: true, duplicate: true };
    if (stop.route.status !== 'EN_CURSO') throw new BadRequestException('Confirma la carga y sal a ruta primero');
    await this.prisma.routeStop.update({ where: { id: stopId }, data: { arrivedAt: at ? new Date(at) : new Date() } });
    return { ok: true };
  }

  /** Ubicaciones del camión; los duplicados (reenvíos sin conexión) se ignoran. */
  async savePings(userId: number, routeId: number, pings: { lat: number; lng: number; accuracy?: number; at: string }[]) {
    const route = await this.ownedRoute(routeId, userId);
    if (route.status !== 'EN_CURSO') return { ok: true, saved: 0 };
    const res = await this.prisma.locationPing.createMany({
      data: pings.map((p) => ({ routeId, lat: p.lat, lng: p.lng, accuracy: p.accuracy ?? null, recordedAt: new Date(p.at) })),
      skipDuplicates: true,
    });
    return { ok: true, saved: res.count };
  }

  async deliver(
    stopId: number,
    userId: number,
    dto: { clientOpId: string; deliveredAt?: string; signature?: string; photo?: string; payment?: PaymentInput; items?: { id: number; qty: number }[] },
  ) {
    const stop = await this.ownedStop(stopId, userId);
    if (stop.status === 'ENTREGADA') return { ok: true, duplicate: true };
    if (stop.status === 'NO_ENTREGADA') throw new BadRequestException('La parada ya se marcó como no entregada');
    if (stop.route.status !== 'EN_CURSO') throw new BadRequestException('Confirma la carga y sal a ruta antes de entregar');
    if (!dto.signature && !dto.photo) throw new BadRequestException('Se requiere la firma o una fotografía del cliente');
    const at = dto.deliveredAt ? new Date(dto.deliveredAt) : new Date();
    // entrega parcial: lo no indicado se entrega completo; nunca más de lo pedido
    const given = new Map((dto.items ?? []).map((x) => [x.id, x.qty]));
    for (const id of given.keys()) if (!stop.items.some((i) => i.id === id)) throw new BadRequestException('Hay un producto que no pertenece a esta parada');
    const delivered = stop.items.map((i) => ({ id: i.id, qty: given.has(i.id) ? given.get(i.id)! : num(i.quantity), ordered: num(i.quantity) }));
    if (delivered.some((d) => d.qty > d.ordered)) throw new BadRequestException('No puedes entregar más de lo pedido');
    if (stop.items.length && delivered.every((d) => d.qty <= 0))
      throw new BadRequestException('Entrega al menos un producto; si no se entregó nada, registra una no entrega');
    await this.prisma.$transaction(async (tx) => {
      await tx.routeStop.update({ where: { id: stopId }, data: { status: 'ENTREGADA', deliveredAt: at, signature: dto.signature, photo: dto.photo } });
      for (const d of delivered) await tx.stopItem.update({ where: { id: d.id }, data: { deliveredQty: d.qty } });
      if (dto.payment && dto.payment.amount > 0) {
        await tx.payment.create({
          data: {
            routeId: stop.routeId,
            stopId,
            customerId: stop.customerId,
            amount: dto.payment.amount,
            method: dto.payment.method,
            receivedAt: at,
            clientOpId: `${dto.clientOpId}:pay`,
            userId,
          },
        });
      }
    });
    return { ok: true };
  }

  async fail(stopId: number, userId: number, dto: { clientOpId: string; reason: string; notes?: string; photo?: string; at?: string }) {
    const stop = await this.ownedStop(stopId, userId);
    if (stop.status === 'NO_ENTREGADA') return { ok: true, duplicate: true };
    if (stop.status === 'ENTREGADA') throw new BadRequestException('La parada ya fue entregada');
    const at = dto.at ? new Date(dto.at) : new Date();
    const type: IncidentType = dto.reason === 'CLIENTE_AUSENTE' ? 'CLIENTE_AUSENTE' : 'OTRO';
    await this.prisma.$transaction(async (tx) => {
      await tx.routeStop.update({ where: { id: stopId }, data: { status: 'NO_ENTREGADA', failReason: dto.reason, failNotes: dto.notes, photo: dto.photo } });
      await tx.incident.create({
        data: {
          routeId: stop.routeId,
          stopId,
          type,
          description: `No entrega: ${dto.reason}${dto.notes ? ' · ' + dto.notes : ''}`,
          photo: dto.photo,
          createdAt: at,
          clientOpId: `${dto.clientOpId}:inc`,
          userId,
        },
      });
    });
    return { ok: true };
  }

  async createPayment(
    userId: number,
    dto: { clientOpId: string; routeId: number; stopId?: number; customerId?: number; amount: number; method: PaymentMethod; receivedAt?: string },
  ) {
    await this.ownedRoute(dto.routeId, userId);
    const dup = await this.prisma.payment.findUnique({ where: { clientOpId: dto.clientOpId } });
    if (dup) return { ok: true, duplicate: true };
    if (dto.amount <= 0) throw new BadRequestException('El monto debe ser mayor a 0');
    await this.prisma.payment.create({
      data: {
        routeId: dto.routeId,
        stopId: dto.stopId,
        customerId: dto.customerId,
        amount: dto.amount,
        method: dto.method,
        receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : new Date(),
        clientOpId: dto.clientOpId,
        userId,
      },
    });
    return { ok: true };
  }

  async payments(routeId: number, userId: number) {
    await this.ownedRoute(routeId, userId);
    const rows = await this.prisma.payment.findMany({ where: { routeId }, include: { customer: true }, orderBy: { receivedAt: 'desc' } });
    const byMethod: Record<string, number> = {};
    let total = 0;
    for (const p of rows) {
      byMethod[p.method] = (byMethod[p.method] ?? 0) + num(p.amount);
      total += num(p.amount);
    }
    return {
      total,
      byMethod,
      items: rows.map((p) => ({ id: p.id, customer: p.customer?.name ?? 'Cobro', amount: num(p.amount), method: p.method, receivedAt: p.receivedAt })),
    };
  }

  async createIncident(
    userId: number,
    dto: { clientOpId: string; routeId: number; stopId?: number; type: IncidentType; description: string; photo?: string; createdAt?: string },
  ) {
    await this.ownedRoute(dto.routeId, userId);
    const dup = await this.prisma.incident.findUnique({ where: { clientOpId: dto.clientOpId } });
    if (dup) return { ok: true, duplicate: true };
    await this.prisma.incident.create({
      data: {
        routeId: dto.routeId,
        stopId: dto.stopId,
        type: dto.type,
        description: dto.description,
        photo: dto.photo,
        createdAt: dto.createdAt ? new Date(dto.createdAt) : new Date(),
        clientOpId: dto.clientOpId,
        userId,
      },
    });
    return { ok: true };
  }

  async incidents(routeId: number, userId: number) {
    await this.ownedRoute(routeId, userId);
    const rows = await this.prisma.incident.findMany({ where: { routeId }, orderBy: { createdAt: 'desc' } });
    return rows.map((i) => ({ id: i.id, type: i.type, description: i.description, createdAt: i.createdAt, stopId: i.stopId }));
  }

  async summary(routeId: number, userId: number) {
    const route = await this.ownedRoute(routeId, userId);
    const pay = await this.payments(routeId, userId);
    const left = new Map<number, { code: string; name: string; presentation: string; quantity: number }>();
    for (const s of route.stops)
      for (const i of s.items) {
        const rest = num(i.quantity) - num(i.deliveredQty);
        if (rest <= 0) continue;
        const cur = left.get(i.productId) ?? { code: i.product.code, name: i.product.name, presentation: i.presentation, quantity: 0 };
        cur.quantity += rest;
        left.set(i.productId, cur);
      }
    const count = (st: string) => route.stops.filter((s) => s.status === st).length;
    return {
      total: route.stops.length,
      delivered: count('ENTREGADA'),
      failed: count('NO_ENTREGADA'),
      pending: count('PENDIENTE'),
      collected: pay.total,
      byMethod: pay.byMethod,
      pendingToCollect: route.stops
        .filter((s) => s.status === 'PENDIENTE')
        .reduce((a, s) => a + (s.paymentTerms === 'Contado' ? s.items.reduce((x, i) => x + num(i.quantity) * num(i.unitPrice), 0) : 0), 0),
      leftover: [...left.values()],
      departedAt: route.departedAt,
      returnedAt: route.returnedAt,
      status: route.status,
    };
  }

  /** Cierra la ruta: lo no entregado regresa al almacén como entrada de ruta. */
  async close(routeId: number, userId: number, returnedAt?: string) {
    const route = await this.ownedRoute(routeId, userId);
    if (route.status === 'FINALIZADA') return this.summary(routeId, userId);
    if (route.status === 'PROGRAMADA') throw new BadRequestException('La ruta aún no ha salido');
    if (route.stops.some((s) => s.status === 'PENDIENTE')) throw new BadRequestException('Aún hay paradas pendientes');
    const back = new Map<number, { kg: number; cost: number }>();
    for (const s of route.stops)
      for (const i of s.items) {
        const rest = (num(i.quantity) - num(i.deliveredQty)) * num(i.factor);
        if (rest <= 0) continue;
        const cur = back.get(i.productId) ?? { kg: 0, cost: num(i.product.purchasePrice) };
        cur.kg += rest;
        back.set(i.productId, cur);
      }
    await this.prisma.$transaction(async (tx) => {
      for (const [productId, b] of back)
        await this.inventory.addEntry(
          { productId, quantity: b.kg, unitCost: b.cost, type: 'ENTRADA_RUTA', reason: `Regreso de ${route.name}`, refType: 'Ruta', refId: route.id, userId },
          tx,
        );
      await tx.route.update({ where: { id: routeId }, data: { status: 'FINALIZADA', returnedAt: returnedAt ? new Date(returnedAt) : new Date() } });
    });
    return this.summary(routeId, userId);
  }
}
