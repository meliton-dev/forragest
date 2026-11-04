import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function users() {
  const list: [string, string, Role][] = [
    ['admin', 'Administrador', Role.ADMINISTRADOR],
    ['cajero', 'Cajero Demo', Role.CAJERO],
    ['almacen', 'Almacenista Demo', Role.ALMACENISTA],
    ['chofer', 'Luis Gómez', Role.CHOFER],
    ['compras', 'Gerente de Compras Demo', Role.GERENTE_COMPRAS],
    ['supervisor', 'Supervisor de Rutas Demo', Role.SUPERVISOR_RUTAS],
  ];
  const passwordHash = await bcrypt.hash(process.env.SEED_PASSWORD ?? 'cambiar123', 10);
  for (const [username, fullName, role] of list) {
    await prisma.user.upsert({ where: { username }, update: { fullName, ...(process.env.SEED_PASSWORD ? { passwordHash } : {}) }, create: { username, fullName, role, passwordHash } });
  }
}

async function productsAndStock() {
  const lines = Object.fromEntries((await prisma.productLine.findMany()).map((l) => [l.code, l.id]));
  const defs = [
    ['BV-001', 'Alimento bovino lechero', 'BOVINO'],
    ['OV-001', 'Alimento ovino engorda', 'OVINO'],
    ['AV-001', 'Alimento para postura', 'AVES'],
  ] as const;
  for (const [code, name, line] of defs) {
    const p = await prisma.product.upsert({
      where: { code },
      update: {},
      create: { code, name, lineId: lines[line], unit: 'kg', purchasePrice: 8.5, salePrice: 10.75, minStock: 200 },
    });
    const sum = await prisma.stockLot.aggregate({ where: { productId: p.id }, _sum: { quantity: true } });
    if (Number(sum._sum.quantity ?? 0) < 1500) {
      const lot = await prisma.stockLot.create({ data: { productId: p.id, quantity: 3000, unitCost: 8.5 } });
      await prisma.inventoryMovement.create({ data: { productId: p.id, lotId: lot.id, type: 'ENTRADA_AJUSTE', quantity: 3000, reason: 'Carga inicial de demostración' } });
    }
  }
}

/** Crea (o reinicia) la ruta de demostración del chofer para hoy. */
async function demoRoute() {
  const driver = await prisma.user.findUniqueOrThrow({ where: { username: 'chofer' } });
  const vehicle = await prisma.vehicle.upsert({ where: { plate: 'TUL-482' }, update: {}, create: { plate: 'TUL-482', name: 'Camión 6 t' } });
  const d = new Date();
  const today = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));

  const old = await prisma.route.findMany({ where: { driverId: driver.id, date: today } });
  for (const r of old) {
    const stops = await prisma.routeStop.findMany({ where: { routeId: r.id }, select: { id: true } });
    const ids = stops.map((s) => s.id);
    await prisma.payment.deleteMany({ where: { routeId: r.id } });
    await prisma.incident.deleteMany({ where: { routeId: r.id } });
    await prisma.stopItem.deleteMany({ where: { stopId: { in: ids } } });
    await prisma.routeStop.deleteMany({ where: { routeId: r.id } });
    await prisma.route.delete({ where: { id: r.id } });
  }

  const prod = Object.fromEntries((await prisma.product.findMany()).map((p) => [p.code, p.id]));
  const customers = [
    ['Rancho San Miguel', 'RSM100315HT2', 'Camino a San Miguel s/n, Tulancingo, Hgo.', '775 100 1122', 'Ernesto Ramírez', 80000, 15],
    ['Borregos La Loma', 'BLL140709QW1', 'Km 4 Carr. a Cuautepec, Tulancingo, Hgo.', '775 118 4420', 'Raúl Mendoza', 60000, 15],
    ['Establo Los Pinos', 'ELP120822KJ5', 'Carr. Federal km 12, Tulancingo, Hgo.', '775 224 7788', 'Raúl Pineda', 150000, 30],
    ['Granja Avícola Sol', 'GAS110601LK9', 'Av. del Sol 88, Acatlán, Hgo.', '771 300 5566', 'María Sol', 120000, 30],
    ['Rancho El Encino', 'REE090927NB3', 'Camino al Encino s/n, Santiago Tulantepec', '775 456 1290', 'Jesús Mora', 50000, 15],
  ] as const;
  const cust: number[] = [];
  for (const [name, rfc, address, phone, contact, creditLimit, creditDays] of customers) {
    const found = await prisma.customer.findFirst({ where: { name } });
    cust.push((found ?? (await prisma.customer.create({ data: { name, rfc, address, phone, contact, creditLimit, creditDays } }))).id);
  }

  const route = await prisma.route.create({ data: { name: 'Ruta 12 · Zona Norte', date: today, driverId: driver.id, vehicleId: vehicle.id } });
  const stops = [
    { c: 0, eta: '08:30', terms: 'Contado', note: null, items: [['BV-001', 'Saco 40 kg', 5, 430]] },
    { c: 1, eta: '09:15', terms: 'Crédito 15 días', note: null, items: [['OV-001', 'Saco 40 kg', 3, 430]] },
    { c: 2, eta: '10:05', terms: 'Contado', note: 'Descargar en el corral 2, junto al silo. Preguntar por Don Raúl.', items: [['BV-001', 'Saco 40 kg', 4, 430]] },
    { c: 3, eta: '10:40', terms: 'Crédito 30 días', note: null, items: [['AV-001', 'Saco 40 kg', 6, 380]] },
    { c: 4, eta: '11:20', terms: 'Contado', note: null, items: [['AV-001', 'Saco 40 kg', 3, 380]] },
  ] as const;
  let seq = 1;
  for (const s of stops) {
    await prisma.routeStop.create({
      data: {
        routeId: route.id, customerId: cust[s.c], sequence: seq++, eta: s.eta, paymentTerms: s.terms, instructions: s.note,
        items: { create: s.items.map(([code, presentation, quantity, unitPrice]) => ({ productId: prod[code], presentation, factor: 40, quantity, unitPrice })) },
      },
    });
  }
}

async function main() {
  for (const [code, name] of [['OVINO', 'Ovino'], ['BOVINO', 'Bovino'], ['AVES', 'Aves']]) {
    await prisma.productLine.upsert({ where: { code }, update: {}, create: { code, name } });
  }
  await users();
  await productsAndStock();
  await demoRoute();
}

main().finally(() => prisma.$disconnect());
