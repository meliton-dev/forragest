/**
 * Ubicación en vivo: endpoint ligero y limpieza de ubicaciones viejas.
 * Crea su propio chofer, camión y ruta; no depende del estado del seed.
 */
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { InventoryService } from '../../src/inventory/inventory.service';
import { LoginLimiter } from '../../src/common/login-limiter';
import { PosService } from '../../src/pos/pos.service';
import { purgeOldPings } from '../../src/routes/ping-retention';
import { RoutesService } from '../../src/routes/routes.service';
import { DriverService } from '../../src/driver/driver.service';
import { PrismaService } from '../../src/prisma.service';

const prisma = new PrismaService();
const routes = new RoutesService(prisma, new PosService(prisma, new InventoryService(prisma), new LoginLimiter()));
const uid = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
let routeId: number;
let driverId: number;
const driverSvc = new DriverService(prisma, new InventoryService(prisma));

beforeAll(async () => {
  const driver = await prisma.user.create({
    data: { username: `chofer-${uid()}`, fullName: 'Chofer en vivo', role: 'CHOFER', passwordHash: await bcrypt.hash('x', 4) },
  });
  const vehicle = await prisma.vehicle.create({ data: { plate: `V-${uid()}`, name: 'Camión de prueba' } });
  const route = await prisma.route.create({
    data: { name: `Ruta en vivo ${uid()}`, date: new Date(), driverId: driver.id, vehicleId: vehicle.id, status: 'EN_CURSO' },
  });
  routeId = route.id;
  driverId = driver.id;
});
afterAll(async () => {
  await prisma.locationPing.deleteMany({ where: { routeId } });
  // la ruta de prueba no debe quedar "en curso" en el mapa en vivo de quien use esta base
  await prisma.route.update({ where: { id: routeId }, data: { status: 'FINALIZADA' } });
  await prisma.$disconnect();
});

describe('ubicación en vivo', () => {
  it('live() devuelve las últimas ubicaciones en orden, la más reciente y la velocidad', async () => {
    const base = Date.now() - 60_000;
    // 10 puntos cada 10 s avanzando ~111 m por tramo (≈ 40 km/h)
    await prisma.locationPing.createMany({
      data: Array.from({ length: 10 }, (_, i) => ({ routeId, lat: 20 + i * 0.001, lng: -98, recordedAt: new Date(base + i * 10_000) })),
    });
    const { routes: out } = await routes.live();
    const mine = out.find((r) => r.id === routeId)!;
    expect(mine).toBeDefined();
    expect(mine.recent).toHaveLength(6); // solo las 6 últimas
    expect(new Date(mine.recent[0].at).getTime()).toBeLessThan(new Date(mine.recent[5].at).getTime()); // de la más antigua a la más reciente
    expect(mine.lastPing!.lat).toBeCloseTo(20.009, 5);
    expect(mine.speedKmh).toBeGreaterThanOrEqual(39);
    expect(mine.speedKmh).toBeLessThanOrEqual(41);
    expect(mine.driver).toBe('Chofer en vivo');
  });

  it('live() no incluye rutas que no están en curso', async () => {
    await prisma.route.update({ where: { id: routeId }, data: { status: 'FINALIZADA' } });
    expect((await routes.live()).routes.find((r) => r.id === routeId)).toBeUndefined();
    await prisma.route.update({ where: { id: routeId }, data: { status: 'EN_CURSO' } });
  });

  it('monitor() también trae la velocidad', async () => {
    const mine = (await routes.monitor()).routes.find((r) => r.id === routeId)!;
    expect(mine.speedKmh).not.toBeNull();
  });

  it('la limpieza borra las ubicaciones viejas y conserva las recientes', async () => {
    const old = new Date(Date.now() - 60 * 86_400_000);
    await prisma.locationPing.createMany({ data: [0, 1, 2].map((i) => ({ routeId, lat: 1, lng: 1, recordedAt: new Date(old.getTime() + i * 1000) })) });
    const before = await prisma.locationPing.count({ where: { routeId } });
    const deleted = await purgeOldPings(prisma, 45);
    expect(deleted).toBeGreaterThanOrEqual(3);
    expect(await prisma.locationPing.count({ where: { routeId } })).toBe(before - 3);
  });
});

describe('estado de la app del chofer (solo lo ve el supervisor)', () => {
  it('el aviso del teléfono queda en el monitoreo y en la consulta ligera', async () => {
    const before = Date.now();
    await driverSvc.reportStatus(driverId, { routeId, pending: 3, oldestPendingAt: '2026-11-24T15:40:00.000Z', rejected: 1, gps: 'denied' });
    const live = (await routes.live()).routes.find((r) => r.id === routeId)!;
    expect(live.sync).toMatchObject({ pending: 3, rejected: 1, gps: 'denied' });
    expect(new Date(live.sync.oldestPendingAt!).toISOString()).toBe('2026-11-24T15:40:00.000Z');
    expect(new Date(live.sync.lastSeenAt!).getTime()).toBeGreaterThanOrEqual(before - 1000);
    const mon = (await routes.monitor()).routes.find((r) => r.id === routeId)!;
    expect(mon.sync.pending).toBe(3);
  });

  it('al ponerse al día se limpia la hora del más viejo', async () => {
    await driverSvc.reportStatus(driverId, { routeId, pending: 0, oldestPendingAt: '2026-11-24T15:40:00.000Z', rejected: 0, gps: 'active' });
    const live = (await routes.live()).routes.find((r) => r.id === routeId)!;
    expect(live.sync).toMatchObject({ pending: 0, oldestPendingAt: null, rejected: 0, gps: 'active' });
  });

  it('otro chofer no puede reportar por esta ruta', async () => {
    await expect(driverSvc.reportStatus(driverId + 100000, { routeId, pending: 0, rejected: 0, gps: 'active' })).rejects.toThrow();
  });

  it('las ubicaciones también cuentan como contacto del teléfono', async () => {
    await prisma.route.update({ where: { id: routeId }, data: { lastSeenAt: new Date(Date.now() - 3_600_000) } });
    await driverSvc.savePings(driverId, routeId, [{ lat: 20, lng: -98, at: new Date().toISOString() }]);
    const r = await prisma.route.findUniqueOrThrow({ where: { id: routeId } });
    expect(Date.now() - r.lastSeenAt!.getTime()).toBeLessThan(60_000);
  });
});

describe('"hoy" es el día del negocio, no el del servidor (UTC)', () => {
  // 10:42 p. m. del sábado 14 en México = 04:42 UTC del domingo 15: un servidor en UTC cree que ya es otro día.
  const NIGHT = new Date('2026-11-15T04:42:00Z');
  const justDate = [
    'hrtime',
    'nextTick',
    'performance',
    'queueMicrotask',
    'setImmediate',
    'clearImmediate',
    'setInterval',
    'clearInterval',
    'setTimeout',
    'clearTimeout',
  ] as const;
  let todayRoute: number;

  beforeAll(async () => {
    const r = await prisma.route.findUniqueOrThrow({ where: { id: routeId } });
    const copy = await prisma.route.create({
      data: { name: `Ruta de hoy ${uid()}`, date: new Date('2026-11-14T00:00:00Z'), driverId: r.driverId, vehicleId: r.vehicleId, status: 'PROGRAMADA' },
    });
    todayRoute = copy.id;
  });
  afterAll(() => prisma.route.update({ where: { id: todayRoute }, data: { status: 'FINALIZADA' } }));

  it('la lista de rutas de hoy incluye la ruta del día local aunque el reloj UTC ya marque el día siguiente', async () => {
    jest.useFakeTimers({ now: NIGHT, doNotFake: [...justDate] });
    try {
      const { routes: list } = await routes.list('today');
      expect(list.map((r) => r.id)).toContain(todayRoute);
    } finally {
      jest.useRealTimers();
    }
  });

  it('al día siguiente local esa ruta ya no es "de hoy"', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-15T07:00:00Z'), doNotFake: [...justDate] }); // 01:00 del 15 en México
    try {
      const { routes: list } = await routes.list('today');
      expect(list.map((r) => r.id)).not.toContain(todayRoute);
    } finally {
      jest.useRealTimers();
    }
  });
});
