import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function users() {
  const list: [string, string, Role][] = [
    ['admin', 'Administrador', Role.ADMINISTRADOR],
    ['cajero', 'Cajero Demo', Role.CAJERO],
    ['almacen', 'Almacenista Demo', Role.ALMACENISTA],
    ['chofer', 'Luis Gómez', Role.CHOFER],
    ['chofer2', 'Marco Díaz', Role.CHOFER],
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

/** Una semana de rutas terminadas (dos repartidores) para que los reportes de eficiencia tengan datos. */
async function history() {
  // también borra las rutas que dejan las pruebas automáticas (llevan “(e2e)” en el nombre)
  const old = await prisma.route.findMany({ where: { OR: [{ name: { startsWith: 'Ruta Hist-' } }, { name: { contains: '(e2e)' } }] }, select: { id: true } });
  for (const r of old) {
    const ids = (await prisma.routeStop.findMany({ where: { routeId: r.id }, select: { id: true } })).map((s) => s.id);
    await prisma.locationPing.deleteMany({ where: { routeId: r.id } });
    await prisma.payment.deleteMany({ where: { routeId: r.id } });
    await prisma.incident.deleteMany({ where: { routeId: r.id } });
    await prisma.stopItem.deleteMany({ where: { stopId: { in: ids } } });
    await prisma.routeStop.deleteMany({ where: { routeId: r.id } });
    await prisma.route.delete({ where: { id: r.id } });
  }
  const drivers = [await prisma.user.findUniqueOrThrow({ where: { username: 'chofer' } }), await prisma.user.findUniqueOrThrow({ where: { username: 'chofer2' } })];
  const vehicles = [await prisma.vehicle.findUniqueOrThrow({ where: { plate: 'TUL-482' } }), await prisma.vehicle.upsert({ where: { plate: 'TUL-317' }, update: {}, create: { plate: 'TUL-317', name: 'Camión 3.5 t' } })];
  const customers = await prisma.customer.findMany({ where: { lat: { not: null } }, orderBy: { id: 'asc' } });
  const product = await prisma.product.findUniqueOrThrow({ where: { code: 'BV-001' } });
  const etas = ['08:30', '09:15', '10:05', '10:40'];
  for (let d = 6; d >= 1; d--) {
    const day = new Date();
    day.setDate(day.getDate() - d);
    const date = new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()));
    for (let di = 0; di < 2; di++) {
      const route = await prisma.route.create({
        data: {
          name: `Ruta Hist-${d}-${di + 1}`, date, driverId: drivers[di].id, vehicleId: vehicles[di].id, status: 'FINALIZADA', plannedDeparture: '07:50',
          departedAt: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 7, 52), returnedAt: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 10),
        },
      });
      for (let k = 0; k < etas.length; k++) {
        const [h, m] = etas[k].split(':').map(Number);
        const late = (d + di + k) % 5 === 0;
        const failed = (d * 3 + k + di) % 11 === 0;
        const arrived = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m + (late ? 28 : -4 + ((d + k) % 12)));
        const delivered = new Date(arrived.getTime() + (12 + ((d * 2 + k * 3) % 14)) * 60000);
        const contado = k % 2 === 0;
        const stop = await prisma.routeStop.create({
          data: {
            routeId: route.id, customerId: customers[(k + di) % customers.length].id, sequence: k + 1, eta: etas[k], paymentTerms: contado ? 'Contado' : 'Crédito 15 días',
            status: failed ? 'NO_ENTREGADA' : 'ENTREGADA', arrivedAt: arrived, deliveredAt: failed ? null : delivered, failReason: failed ? (k % 2 ? 'RECHAZO' : 'CLIENTE_AUSENTE') : null,
            items: { create: [{ productId: product.id, presentation: 'Saco 40 kg', factor: 40, quantity: 3 + k, unitPrice: 430, deliveredQty: failed ? 0 : 3 + k }] },
          },
        });
        if (!failed && contado) {
          await prisma.payment.create({ data: { routeId: route.id, stopId: stop.id, customerId: stop.customerId, amount: (3 + k) * 430, method: k % 4 === 0 ? 'TRANSFERENCIA' : 'EFECTIVO', receivedAt: delivered, clientOpId: `seed-hist-${d}-${di}-${k}`, userId: drivers[di].id } });
        }
      }
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
    await prisma.locationPing.deleteMany({ where: { routeId: r.id } });
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

  // coordenadas aproximadas (Tulancingo, Hgo.) para el mapa de monitoreo
  const coords: Record<string, [number, number]> = {
    'Rancho San Miguel': [20.095, -98.33],
    'Borregos La Loma': [20.078, -98.305],
    'Establo Los Pinos': [20.11, -98.405],
    'Granja Avícola Sol': [20.1417, -98.4333],
    'Rancho El Encino': [20.05, -98.37],
  };
  for (const [name, [lat, lng]] of Object.entries(coords)) await prisma.customer.updateMany({ where: { name }, data: { lat, lng } });

  const route = await prisma.route.create({ data: { name: 'Ruta 12 · Zona Norte', date: today, driverId: driver.id, vehicleId: vehicle.id, plannedDeparture: '07:50' } });
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

/** Proveedores y compras de demostración: una orden enviada, una recibida con faltante y cuentas por pagar vencida y por vencer. */
async function purchasingDemo() {
  const lines = Object.fromEntries((await prisma.productLine.findMany()).map((l) => [l.code, l.id]));
  const defs: [string, string, string, number, string[]][] = [
    ['Molinos del Bajío S.A. de C.V.', 'MBA010203AB1', '442 555 0101', 15, ['BOVINO', 'OVINO']],
    ['Granos y Forrajes Tula', 'GFT950612XY9', '773 555 0144', 0, ['AVES', 'BOVINO']],
    ['Minerales del Centro', 'MCE000101KL4', '55 5555 0188', 30, ['OVINO']],
  ];
  const sup: Record<string, number> = {};
  for (const [name, rfc, phone, paymentDays, ls] of defs) {
    const found = await prisma.supplier.findFirst({ where: { name } });
    const data = { name, rfc, phone, paymentDays, contact: 'Ventas', lines: { set: ls.map((l) => ({ id: lines[l] })) } };
    sup[name] = found ? (await prisma.supplier.update({ where: { id: found.id }, data })).id : (await prisma.supplier.create({ data: { ...data, lines: { connect: ls.map((l) => ({ id: lines[l] })) } } })).id;
  }
  const admin = await prisma.user.findUniqueOrThrow({ where: { username: 'compras' } });
  const prod = Object.fromEntries((await prisma.product.findMany()).map((x) => [x.code, x]));
  const day = 86_400_000;
  const todayUtc = (() => { const d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); })();
  const orders: { folio: string; supplier: string; status: 'ENVIADA' | 'RECIBIDA'; items: [string, number, number, number][]; payableDue?: number }[] = [
    { folio: 'OC-DEMO1', supplier: defs[0][0], status: 'ENVIADA', items: [['BV-001', 2000, 8.4, 0], ['BV-003', 1200, 9.1, 0]] },
    { folio: 'OC-DEMO2', supplier: defs[1][0], status: 'RECIBIDA', items: [['AV-004', 3000, 5.9, 2800]], payableDue: -3 },
    { folio: 'OC-DEMO3', supplier: defs[2][0], status: 'RECIBIDA', items: [['OV-002', 800, 7.6, 800]], payableDue: 5 },
  ];
  for (const o of orders) {
    if (await prisma.purchaseOrder.findUnique({ where: { folio: o.folio } })) continue;
    const order = await prisma.purchaseOrder.create({
      data: {
        folio: o.folio, supplierId: sup[o.supplier], status: o.status, createdBy: admin.id, sentAt: new Date(Date.now() - 6 * day), closedAt: o.status === 'RECIBIDA' ? new Date() : null,
        items: { create: o.items.map(([code, quantity, unitCost, receivedQty]) => ({ productId: prod[code].id, quantity, unitCost, receivedQty })) },
      },
    });
    if (o.payableDue === undefined) continue;
    const receipt = await prisma.purchaseReceipt.create({ data: { orderId: order.id, receivedBy: admin.id, notes: 'Recepción de demostración' } });
    const amount = o.items.reduce((a, [, , cost, got]) => a + cost * got, 0);
    await prisma.payable.create({ data: { supplierId: sup[o.supplier], orderId: order.id, receiptId: receipt.id, amount: Math.round(amount * 100) / 100, dueDate: new Date(todayUtc.getTime() + o.payableDue * day) } });
  }
}

async function main() {
  for (const [code, name] of [['OVINO', 'Ovino'], ['BOVINO', 'Bovino'], ['AVES', 'Aves']]) {
    await prisma.productLine.upsert({ where: { code }, update: {}, create: { code, name } });
  }
  await users();
  await productsAndStock();
  await demoRoute();
  await history();
  await overdueDemo();
  await purchasingDemo();
}

main().finally(() => prisma.$disconnect());
