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
  // [código, nombre, línea, presentaciones [nombre, kg por presentación, precio], existencia inicial en kg]
  const catalog: [string, string, string, [string, number, number][], number][] = [
    ['BV-001', 'Alimento bovino lechero', 'BOVINO', [['Saco 40 kg', 40, 430], ['Granel · kg', 1, 11]], 3000],
    ['BV-003', 'Concentrado bovino engorda', 'BOVINO', [['Saco 40 kg', 40, 465]], 2000],
    ['BV-002', 'Sal mineralizada bovino', 'BOVINO', [['Saco 25 kg', 25, 310]], 0],
    ['BV-006', 'Pasta de soya', 'BOVINO', [['Saco 40 kg', 40, 520]], 2000],
    ['OV-001', 'Alimento ovino engorda', 'OVINO', [['Saco 40 kg', 40, 430], ['Saco 20 kg', 20, 220]], 3000],
    ['OV-002', 'Suplemento mineral ovino', 'OVINO', [['Saco 20 kg', 20, 185]], 1500],
    ['OV-004', 'Alimento ovino lactancia', 'OVINO', [['Saco 40 kg', 40, 448]], 2000],
    ['AV-001', 'Alimento para postura', 'AVES', [['Saco 40 kg', 40, 380], ['Granel · kg', 1, 9.5]], 3000],
    ['AV-002', 'Iniciador pollo engorda', 'AVES', [['Saco 20 kg', 20, 240]], 1500],
    ['AV-003', 'Alimento de traspatio', 'AVES', [['Saco 20 kg', 20, 205]], 1500],
    ['AV-004', 'Maíz quebrado', 'AVES', [['Granel · kg', 1, 7.8]], 4000],
  ];
  for (const [code, name, line, pres, stock] of catalog) {
    const [, f0, p0] = pres[0];
    const salePrice = Math.round((p0 / f0) * 100) / 100;
    const p = await prisma.product.upsert({
      where: { code },
      update: { name, salePrice },
      create: { code, name, lineId: lines[line], unit: 'kg', purchasePrice: Math.round(salePrice * 0.78 * 100) / 100, salePrice, minStock: 200 },
    });
    for (const [pname, factor, price] of pres) {
      await prisma.presentation.upsert({
        where: { productId_name: { productId: p.id, name: pname } },
        update: { factor, salePrice: price },
        create: { productId: p.id, name: pname, factor, salePrice: price },
      });
    }
    const sum = await prisma.stockLot.aggregate({ where: { productId: p.id }, _sum: { quantity: true } });
    if (stock > 0 && Number(sum._sum.quantity ?? 0) < 1500) {
      const lot = await prisma.stockLot.create({ data: { productId: p.id, quantity: stock, unitCost: Math.round(salePrice * 0.78 * 100) / 100 } });
      await prisma.inventoryMovement.create({ data: { productId: p.id, lotId: lot.id, type: 'ENTRADA_AJUSTE', quantity: stock, reason: 'Carga inicial de demostración' } });
    }
  }
}

/** Cliente con una venta a crédito vencida (63 días) para mostrar la alerta de crédito bloqueado en el POS. */
async function overdueDemo() {
  const customer = await prisma.customer.findFirstOrThrow({ where: { name: 'Borregos La Loma' } });
  if (await prisma.sale.findUnique({ where: { clientOpId: 'seed-overdue-borregos' } })) return;
  const cashier = await prisma.user.findUniqueOrThrow({ where: { username: 'cajero' } });
  const past = new Date();
  past.setDate(past.getDate() - 78);
  const due = new Date();
  due.setDate(due.getDate() - 63);
  const shift = await prisma.cashShift.create({ data: { cashierId: cashier.id, openedAt: past, closedAt: past, status: 'CERRADO', openingFloat: 0, expectedCash: 0, countedCash: 0, difference: 0 } });
  await prisma.sale.create({
    data: {
      shiftId: shift.id, cashierId: cashier.id, customerId: customer.id, status: 'POR_COBRAR', paymentMethod: 'CREDITO', subtotal: 14300, total: 14300,
      balance: 14300, dueDate: new Date(Date.UTC(due.getFullYear(), due.getMonth(), due.getDate())), createdAt: past, clientOpId: 'seed-overdue-borregos',
    },
  });
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
  await overdueDemo();
}

main().finally(() => prisma.$disconnect());
