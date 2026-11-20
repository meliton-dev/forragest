import { PaymentMethod, Prisma, PrismaClient, SalePayment } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { databaseHost, isLocalDatabaseUrl, loadEnv } from './db-guard';
import { addDays, atBusinessTime, businessDate } from '../src/common/time';
import {
  CUSTOMERS,
  OVERDUE_CUSTOMER,
  PRODUCTS,
  PURCHASES,
  ROUTE_PRODUCTS,
  STAFF,
  STOP_NOTES,
  SUPPLIERS,
  TODAY_STOPS,
  VEHICLES,
  ZONES,
  ZONE_TODAY,
} from './seed-data';

/**
 * Carga la forrajera de demostración (datos ficticios, ver seed-data.ts) y su historia reciente:
 * compras recibidas, ventas de mostrador de las últimas semanas, rutas terminadas y la ruta de hoy.
 * Se puede correr las veces que haga falta: no repite lo que ya existe y completa los días que falten.
 */
const prisma = new PrismaClient();

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
/** Las fechas del negocio son medianoche UTC; la forrajera no abre en domingo. */
const isWorkingDay = (d: Date) => d.getUTCDay() !== 0;
function workingDays(from: Date, to: Date) {
  const out: Date[] = [];
  for (let d = from; d.getTime() <= to.getTime(); d = addDays(d, 1)) if (isWorkingDay(d)) out.push(d);
  return out;
}
function nextWorkingDay(d: Date) {
  let n = addDays(d, 1);
  while (!isWorkingDay(n)) n = addDays(n, 1);
  return n;
}

// Azar repetible: la misma fecha genera siempre los mismos datos, así el seed no cambia la historia al repetirse.
type Rand = () => number;
function rng(seed: string): Rand {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const int = (r: Rand, min: number, max: number) => min + Math.floor(r() * (max - min + 1));
const pick = <T>(r: Rand, list: readonly T[]): T => list[Math.floor(r() * list.length)];
function weighted<T>(r: Rand, list: readonly T[], weight: (x: T) => number): T {
  let x = r() * list.reduce((a, i) => a + weight(i), 0);
  for (const i of list) {
    x -= weight(i);
    if (x <= 0) return i;
  }
  return list[list.length - 1];
}
function shuffle<T>(r: Rand, list: readonly T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const userByName = (username: string) => prisma.user.findUniqueOrThrow({ where: { username } });
const productIds = async () => Object.fromEntries((await prisma.product.findMany({ select: { code: true, id: true } })).map((x) => [x.code, x.id]));
/** Presentaciones del catálogo por "código|presentación": kg y precio. */
async function presentationMap() {
  const rows = await prisma.presentation.findMany({ include: { product: true } });
  return new Map(rows.map((x) => [`${x.product.code}|${x.name}`, { productId: x.productId, factor: Number(x.factor), price: Number(x.salePrice ?? 0) }]));
}
/** Clientes de la forrajera (por nombre), con su zona de reparto. */
async function seedCustomers() {
  const rows = await prisma.customer.findMany({ where: { name: { in: CUSTOMERS.map((x) => x.name) } }, orderBy: { id: 'asc' } });
  return CUSTOMERS.map((def) => ({ ...rows.find((x) => x.name === def.name)!, zone: def.zone }));
}

// ---------- Catálogos ----------

/** Se niega a correr contra una base que no sea local (salvo SEED_ALLOW_REMOTE=1) y exige SEED_PASSWORD fuera de local. */
function checkTarget() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  const local = isLocalDatabaseUrl(url);
  if (!local && process.env.SEED_ALLOW_REMOTE !== '1') {
    const host = databaseHost(url);
    throw new Error(
      `El seed se canceló: la base de datos no es local (${host ? `host "${host}"` : 'DATABASE_URL falta o no se puede leer'}). ` +
        'Si de verdad quieres cargarla ahí (por ejemplo una base NUEVA y vacía en Render), vuelve a correrlo con SEED_ALLOW_REMOTE=1. No se tocó nada.',
    );
  }
  if (!local && !process.env.SEED_PASSWORD) {
    throw new Error(
      'El seed se canceló: con una base que no es local hay que definir SEED_PASSWORD (la contraseña de los usuarios de demostración). No se usa "cambiar123" fuera de tu computadora.',
    );
  }
}

/**
 * Crea los usuarios que falten. A los que ya existen NO se les cambia la contraseña ni el nombre,
 * salvo con SEED_RESET_PASSWORDS=1 (entonces se les pone SEED_PASSWORD, o "cambiar123" en una base local).
 */
async function users() {
  const reset = process.env.SEED_RESET_PASSWORDS === '1';
  const passwordHash = await bcrypt.hash(process.env.SEED_PASSWORD ?? 'cambiar123', 10);
  for (const [username, fullName, role] of STAFF) {
    const exists = await prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (!exists) await prisma.user.create({ data: { username, fullName, role, passwordHash } });
    else if (reset) await prisma.user.update({ where: { username }, data: { fullName, passwordHash } });
  }
}

async function vehicles() {
  for (const [plate, name] of VEHICLES) await prisma.vehicle.upsert({ where: { plate }, update: { name }, create: { plate, name } });
}

async function catalog() {
  const lines = Object.fromEntries((await prisma.productLine.findMany()).map((l) => [l.code, l.id]));
  for (const d of PRODUCTS) {
    const [, f0, p0] = d.pres[0];
    const data = { name: d.name, description: d.description ?? null, salePrice: r2(p0 / f0), purchasePrice: d.cost, minStock: d.min };
    const product = await prisma.product.upsert({
      where: { code: d.code },
      update: data,
      create: { code: d.code, lineId: lines[d.line], unit: 'kg', ...data },
    });
    for (const [name, factor, salePrice] of d.pres) {
      await prisma.presentation.upsert({
        where: { productId_name: { productId: product.id, name } },
        update: { factor, salePrice },
        create: { productId: product.id, name, factor, salePrice },
      });
    }
  }
}

async function customers() {
  for (const { zone: _zone, ...data } of CUSTOMERS) {
    const found = await prisma.customer.findFirst({ where: { name: data.name }, orderBy: { id: 'asc' } });
    if (found) await prisma.customer.update({ where: { id: found.id }, data });
    else await prisma.customer.create({ data });
  }
}

async function suppliers() {
  const lines = Object.fromEntries((await prisma.productLine.findMany()).map((l) => [l.code, l.id]));
  for (const { lines: ls, ...data } of SUPPLIERS) {
    const found = await prisma.supplier.findFirst({ where: { name: data.name }, orderBy: { id: 'asc' } });
    const ids = ls.map((l) => ({ id: lines[l] }));
    if (found) await prisma.supplier.update({ where: { id: found.id }, data: { ...data, lines: { set: ids } } });
    else await prisma.supplier.create({ data: { ...data, lines: { connect: ids } } });
  }
}

// ---------- Compras ----------

const orderFolio = (id: number) => `OC-${String(id).padStart(5, '0')}`;

/**
 * Historial de compras: órdenes recibidas (cada recepción entra al inventario como un lote, igual que en la API),
 * cuentas por pagar pagadas, por vencer y vencidas, órdenes en camino y un borrador.
 */
async function purchases() {
  const today = businessDate();
  const buyer = await userByName('compras');
  const keeper = await userByName('almacen');
  const supplierOf = Object.fromEntries((await prisma.supplier.findMany({ orderBy: { id: 'desc' } })).map((x) => [x.name, x]));
  const prod = await productIds();

  for (const def of PURCHASES) {
    const sentAt = atBusinessTime(addDays(today, def.sent), 10, 15);
    const createdAt = new Date(sentAt.getTime() - 45 * 60_000);
    const expectedAt = def.expected !== undefined ? addDays(today, def.expected) : def.received !== undefined ? addDays(today, def.received) : null;

    let order = await prisma.purchaseOrder.findFirst({ where: { notes: def.ref } });
    if (!order && def.legacyFolio) {
      // bases sembradas con la versión anterior: se conserva la orden y se le da folio y referencia normales
      const legacy = await prisma.purchaseOrder.findUnique({ where: { folio: def.legacyFolio } });
      if (legacy) order = await prisma.purchaseOrder.update({ where: { id: legacy.id }, data: { notes: def.ref, folio: orderFolio(legacy.id) } });
    }
    if (order) {
      // lo que sigue abierto conserva fechas vigentes respecto a hoy
      if (order.status === 'ENVIADA') await prisma.purchaseOrder.update({ where: { id: order.id }, data: { sentAt, createdAt, expectedAt } });
      if (order.status === 'BORRADOR') await prisma.purchaseOrder.update({ where: { id: order.id }, data: { createdAt } });
      if (def.due !== undefined) await prisma.payable.updateMany({ where: { orderId: order.id, paidAt: null }, data: { dueDate: addDays(today, def.due) } });
      continue;
    }

    const supplier = supplierOf[def.supplier];
    const receivedAt = def.received !== undefined ? atBusinessTime(addDays(today, def.received), 11, 30) : null;
    const created = await prisma.purchaseOrder.create({
      data: {
        folio: `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        supplierId: supplier.id,
        status: def.status,
        notes: def.ref,
        createdBy: buyer.id,
        createdAt,
        sentAt: def.status === 'BORRADOR' ? null : sentAt,
        expectedAt,
        closedAt: receivedAt,
        items: {
          create: def.items.map(([code, quantity, unitCost, got]) => ({
            productId: prod[code],
            quantity,
            unitCost,
            receivedQty: receivedAt ? (got ?? quantity) : 0,
          })),
        },
      },
      include: { items: { orderBy: { id: 'asc' } } },
    });
    const folio = orderFolio(created.id);
    await prisma.purchaseOrder.update({ where: { id: created.id }, data: { folio } });
    if (!receivedAt) continue;

    const receipt = await prisma.purchaseReceipt.create({
      data: {
        orderId: created.id,
        receivedBy: keeper.id,
        notes: def.receiptNotes ?? null,
        createdAt: receivedAt,
        items: {
          create: def.items.map(([, quantity, , got, note], i) => ({ orderItemId: created.items[i].id, quantity: got ?? quantity, note: note ?? null })),
        },
      },
    });
    let amount = 0;
    for (const [code, quantity, unitCost, got] of def.items) {
      const qty = got ?? quantity;
      const lot = await prisma.stockLot.create({ data: { productId: prod[code], quantity: qty, unitCost, receivedAt } });
      await prisma.inventoryMovement.create({
        data: {
          productId: prod[code],
          lotId: lot.id,
          type: 'ENTRADA_COMPRA',
          quantity: qty,
          reason: `Recepción ${folio}`,
          refType: 'OrdenCompra',
          refId: created.id,
          userId: keeper.id,
          createdAt: receivedAt,
        },
      });
      amount += qty * unitCost;
    }
    amount = r2(amount);
    const open = def.due !== undefined;
    const dueDate = open ? addDays(today, def.due!) : addDays(today, def.received! + supplier.paymentDays);
    // lo ya pagado se liquidó a su vencimiento (o ayer, si vence hoy o después)
    const paidDay = dueDate.getTime() < today.getTime() ? dueDate : addDays(today, -1);
    await prisma.payable.create({
      data: {
        supplierId: supplier.id,
        orderId: created.id,
        receiptId: receipt.id,
        amount,
        dueDate,
        paidAmount: open ? (def.partialPayment ?? 0) : amount,
        paidAt: open ? null : atBusinessTime(paidDay, 13, 0),
        createdAt: receivedAt,
      },
    });
  }
}

// ---------- Ventas de mostrador ----------

interface Lot {
  id: number;
  qty: number;
  cost: number;
  at: number;
  dirty: boolean;
}
interface Pres {
  name: string;
  factor: number;
  price: number;
}
interface Line {
  productId: number;
  pres: Pres;
  units: number;
  kg: number;
  day: number;
}

const SEED_SALE = 'seed-v-';
/** Días hacia atrás que cubre el historial de ventas. */
const SALES_WINDOW = 24;

/**
 * Ventas de mostrador de los días hábiles anteriores a hoy, con sus turnos de caja cerrados.
 * La primera vez vende lo que sobra respecto a la existencia normal de cada producto (así el inventario
 * cuadra: lo comprado menos lo vendido es lo que hay); después solo agrega los días que falten.
 * Las salidas consumen los lotes más antiguos primero (PEPS), como lo hace la API.
 */
async function salesHistory() {
  const today = businessDate();
  // las ventas a crédito de este historial se dan por cobradas al vencer: el único cliente con saldo vencido es el de la demostración
  await prisma.sale.updateMany({
    where: { clientOpId: { startsWith: SEED_SALE }, status: 'POR_COBRAR', dueDate: { lt: today } },
    data: { status: 'PAGADA', balance: 0 },
  });

  const last = await prisma.sale.findFirst({ where: { clientOpId: { startsWith: SEED_SALE } }, orderBy: { createdAt: 'desc' } });
  const windowStart = addDays(today, -SALES_WINDOW);
  const from = last ? new Date(Math.max(windowStart.getTime(), addDays(businessDate(last.createdAt), 1).getTime())) : windowStart;
  const days = workingDays(from, addDays(today, -1));
  if (!days.length) return;
  const firstTime = !last;

  const defs = new Map(PRODUCTS.map((d) => [d.code, d]));
  const products = await prisma.product.findMany({ where: { code: { in: [...defs.keys()] } }, include: { presentations: true }, orderBy: { code: 'asc' } });
  const lots = new Map<number, Lot[]>();
  for (const l of await prisma.stockLot.findMany({
    where: { quantity: { gt: 0 }, productId: { in: products.map((x) => x.id) } },
    orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
  })) {
    lots.set(l.productId, [
      ...(lots.get(l.productId) ?? []),
      { id: l.id, qty: Number(l.quantity), cost: Number(l.unitCost), at: l.receivedAt.getTime(), dirty: false },
    ]);
  }
  const dayWeight = (d: Date) => (d.getUTCDay() === 6 ? 1.5 : d.getUTCDay() === 1 ? 1.2 : 1);
  const dayIndexes = days.map((_, i) => i);

  // 1) Qué se vendió de cada producto y en qué día
  const lines: Line[] = [];
  for (const product of products) {
    const def = defs.get(product.code)!;
    const mine = lots.get(product.id) ?? [];
    const stock = mine.reduce((a, l) => a + l.qty, 0);
    const pres: Pres[] = product.presentations.map((x) => ({ name: x.name, factor: Number(x.factor), price: Number(x.salePrice ?? 0) }));
    const r = rng(`ventas-${product.code}-${ymd(days[0])}`);
    const low = def.stock < def.min; // productos que se muestran bajos a propósito: terminan justo en su existencia
    // un almacén real no termina en números redondos: quedan unos sacos (y kilos a granel) de más
    const spare = low ? 0 : int(r, 0, 3) * Math.max(...pres.map((x) => x.factor)) + (pres.some((x) => x.factor === 1) ? int(r, 0, 35) : 0);
    const budget = firstTime ? stock - def.stock - spare : low ? 0 : Math.min(stock - def.stock * 0.7, def.stock * 0.035 * days.length);
    if (budget <= 0 || !mine.length) continue;
    // no se vende antes de que haya llegado el primer lote
    const firstDay = days.findIndex((d) => atBusinessTime(d, 18, 0).getTime() >= mine[0].at);
    if (firstDay < 0) continue;
    let left = r3(budget);
    for (let guard = 0; guard < 2000; guard++) {
      const fits = pres.filter((x) => x.factor <= left);
      if (!fits.length) break;
      const x = pick(r, fits);
      const size = r();
      let units: number;
      if (x.factor === 1) units = size < 0.8 ? int(r, 3, 25) : size < 0.95 ? int(r, 30, 80) : int(r, 100, 250);
      else units = size < 0.8 ? (r() < 0.65 ? 1 : 2) : size < 0.95 ? int(r, 3, 8) : int(r, 10, 25);
      units = Math.min(units, Math.floor(left / x.factor));
      const day = weighted(
        r,
        dayIndexes.filter((i) => i >= firstDay),
        (i) => dayWeight(days[i]),
      );
      lines.push({ productId: product.id, pres: x, units, kg: r3(units * x.factor), day });
      left = r3(left - units * x.factor);
    }
  }

  const consume = (productId: number, kg: number, at: number) => {
    let pending = kg;
    const out: { lotId: number; qty: number; cost: number }[] = [];
    // primero los lotes que ya habían llegado ese día; si no alcanzan, los demás
    for (const onlyArrived of [true, false]) {
      for (const lot of lots.get(productId) ?? []) {
        if (pending <= 0) break;
        if (lot.qty <= 0 || (onlyArrived && lot.at > at)) continue;
        const take = Math.min(lot.qty, pending);
        lot.qty = r3(lot.qty - take);
        lot.dirty = true;
        out.push({ lotId: lot.id, qty: take, cost: lot.cost });
        pending = r3(pending - take);
      }
    }
    return out;
  };

  const cashiers = [await userByName('cajero'), await userByName('cajero2')];
  const supervisor = await userByName('supervisor');
  const clients = await seedCustomers();
  const owed = new Map<number, number>();
  for (const g of await prisma.sale.groupBy({ by: ['customerId'], where: { status: 'POR_COBRAR', balance: { gt: 0 } }, _sum: { balance: true } })) {
    if (g.customerId) owed.set(g.customerId, Number(g._sum.balance ?? 0));
  }

  // 2) Día por día: se agrupan en tickets, se cobran y se cierra la caja
  let salesCount = 0;
  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const r = rng(`caja-${ymd(day)}`);
    const todays = shuffle(
      r,
      lines.filter((l) => l.day === i),
    );
    if (!todays.length) continue;
    const big = todays.filter((l) => l.kg >= 200);
    const small = todays.filter((l) => l.kg < 200);
    const tickets: { lines: Line[]; customer: (typeof clients)[number] | null }[] = [];
    for (const b of big) {
      const t = { lines: [b], customer: pick(r, clients) };
      if (small.length && r() < 0.4) t.lines.push(small.pop()!);
      tickets.push(t);
    }
    while (small.length) {
      const n = r();
      tickets.push({ lines: small.splice(0, n < 0.55 ? 1 : n < 0.85 ? 2 : 3), customer: r() < 0.12 ? pick(r, clients) : null });
    }

    const saturday = day.getUTCDay() === 6;
    const twoRegisters = saturday || day.getUTCDay() === 1;
    const closing = saturday ? 15 * 60 : 18 * 60;
    const drafts = tickets
      .map((t) => {
        // el mismo producto y presentación dos veces en un ticket se junta en una partida
        const merged: Line[] = [];
        for (const l of t.lines) {
          const same = merged.find((m) => m.productId === l.productId && m.pres.name === l.pres.name);
          if (same) {
            same.units += l.units;
            same.kg = r3(same.kg + l.kg);
          } else merged.push({ ...l });
        }
        const subtotal = r2(merged.reduce((a, l) => a + r2(l.units * l.pres.price), 0));
        const c = t.customer;
        const discountPct = c && subtotal > 3000 && r() < 0.08 ? pick(r, [3, 5]) : 0;
        const discountAmount = r2((subtotal * discountPct) / 100);
        const total = r2(subtotal - discountAmount);

        let method: SalePayment;
        const m = r();
        if (!c) method = m < 0.8 ? 'EFECTIVO' : m < 0.92 ? 'TARJETA' : 'TRANSFERENCIA';
        else {
          const limit = Number(c.creditLimit);
          const canCredit = limit > 0 && c.name !== OVERDUE_CUSTOMER && (owed.get(c.id) ?? 0) + total <= limit * 0.6;
          if (canCredit && m < 0.5) method = 'CREDITO';
          else method = m < 0.8 || total > 8000 ? 'TRANSFERENCIA' : 'EFECTIVO';
        }
        let received: number | null = total;
        let change: number | null = null;
        let balance = 0;
        let dueDate: Date | null = null;
        let status: 'PAGADA' | 'POR_COBRAR' = 'PAGADA';
        if (method === 'EFECTIVO') {
          const bill = pick(r, [50, 100, 200, 500]);
          received = Math.ceil(total / bill) * bill;
          change = r2(received - total);
        } else if (method === 'CREDITO') {
          received = null;
          dueDate = addDays(day, c!.creditDays);
          const age = Math.round((today.getTime() - day.getTime()) / 86_400_000);
          if (dueDate.getTime() >= today.getTime() && !(age > 7 && r() < 0.4)) {
            status = 'POR_COBRAR';
            balance = total;
            owed.set(c!.id, (owed.get(c!.id) ?? 0) + total);
          }
        }
        return {
          minute: int(r, 8 * 60 + 5, closing - 10),
          cashier: twoRegisters && r() < 0.4 ? cashiers[1] : cashiers[0],
          customerId: c?.id ?? null,
          lines: merged,
          subtotal,
          discountAmount,
          total,
          method,
          received,
          change,
          balance,
          dueDate,
          status,
        };
      })
      .sort((a, b) => a.minute - b.minute);

    const movements: Prisma.InventoryMovementCreateManyInput[] = [];
    let n = 0;
    for (const cashier of cashiers) {
      const own = drafts.filter((d) => d.cashier.id === cashier.id);
      if (!own.length) continue;
      const openingFloat = 1500;
      const expectedCash = r2(openingFloat + own.filter((d) => d.method === 'EFECTIVO').reduce((a, d) => a + d.total, 0));
      const miss = r();
      const difference = miss < 0.75 ? 0 : miss < 0.87 ? -10 : miss < 0.94 ? 5 : miss < 0.98 ? -20 : 50;
      const shift = await prisma.cashShift.create({
        data: {
          register: cashier.username === 'cajero2' ? 'Caja 2' : 'Caja 1',
          cashierId: cashier.id,
          openedAt: atBusinessTime(day, 7, 50 + int(r, 0, 9)),
          closedAt: atBusinessTime(day, 0, closing + int(r, 4, 18)),
          status: 'CERRADO',
          openingFloat,
          expectedCash,
          countedCash: r2(expectedCash + difference),
          difference,
          notes: difference < 0 ? 'Faltante en morralla.' : difference > 0 ? 'Sobrante; se deja en caja para el fondo de mañana.' : null,
        },
      });
      for (const d of own) {
        const createdAt = atBusinessTime(day, 0, d.minute);
        const used = d.lines.map((l) => consume(l.productId, l.kg, createdAt.getTime()));
        const sale = await prisma.sale.create({
          data: {
            shiftId: shift.id,
            cashierId: cashier.id,
            customerId: d.customerId,
            status: d.status,
            paymentMethod: d.method,
            subtotal: d.subtotal,
            discountAmount: d.discountAmount,
            total: d.total,
            received: d.received,
            change: d.change,
            balance: d.balance,
            dueDate: d.dueDate,
            discountAuthorizedById: d.discountAmount > 0 ? supervisor.id : null,
            createdAt,
            clientOpId: `${SEED_SALE}${ymd(day)}-${++n}`,
            items: {
              create: d.lines.map((l, k) => ({
                productId: l.productId,
                presentation: l.pres.name,
                factor: l.pres.factor,
                quantity: l.units,
                unitPrice: l.pres.price,
                total: r2(l.units * l.pres.price),
                costTotal: r2(used[k].reduce((a, u) => a + u.qty * u.cost, 0)),
              })),
            },
          },
        });
        d.lines.forEach((l, k) => {
          for (const u of used[k]) {
            movements.push({
              productId: l.productId,
              lotId: u.lotId,
              type: 'SALIDA_VENTA',
              quantity: -u.qty,
              reason: `Venta folio ${sale.folio}`,
              refType: 'Venta',
              refId: sale.id,
              userId: cashier.id,
              createdAt,
            });
          }
        });
        salesCount++;
      }
    }
    if (movements.length) await prisma.inventoryMovement.createMany({ data: movements });
  }
  for (const list of lots.values()) for (const lot of list) if (lot.dirty) await prisma.stockLot.update({ where: { id: lot.id }, data: { quantity: lot.qty } });
  console.log(`Historial de ventas: ${salesCount} ventas en ${days.length} día(s) hábil(es).`);
}

/** Si un producto quedó por debajo de la mitad de su existencia normal (por pruebas o demostraciones), se repone. */
async function restock() {
  const keeper = await userByName('almacen');
  const prod = await productIds();
  const sums = await prisma.stockLot.groupBy({ by: ['productId'], _sum: { quantity: true } });
  const stock = new Map(sums.map((x) => [x.productId, Number(x._sum.quantity ?? 0)]));
  for (const d of PRODUCTS) {
    const have = stock.get(prod[d.code]) ?? 0;
    if (d.stock <= 0 || have >= d.stock * 0.5) continue;
    const quantity = r3(d.stock - have);
    const lot = await prisma.stockLot.create({ data: { productId: prod[d.code], quantity, unitCost: d.cost } });
    await prisma.inventoryMovement.create({
      data: { productId: prod[d.code], lotId: lot.id, type: 'ENTRADA_AJUSTE', quantity, reason: 'Ajuste por inventario físico', userId: keeper.id },
    });
  }
}

/** Cliente con una venta a crédito vencida (63 días) para mostrar la alerta de crédito bloqueado en el POS. */
async function overdueDemo() {
  const customer = await prisma.customer.findFirstOrThrow({ where: { name: OVERDUE_CUSTOMER }, orderBy: { id: 'asc' } });
  const cashier = await userByName('cajero');
  const past = addDays(businessDate(), -78);
  const due = addDays(businessDate(), -63);
  let sale = await prisma.sale.findUnique({ where: { clientOpId: 'seed-overdue-borregos' }, include: { items: true } });
  if (!sale) {
    const shift = await prisma.cashShift.create({
      data: {
        cashierId: cashier.id,
        openedAt: atBusinessTime(past, 7, 55),
        closedAt: atBusinessTime(past, 18, 10),
        status: 'CERRADO',
        openingFloat: 1500,
        expectedCash: 1500,
        countedCash: 1500,
        difference: 0,
      },
    });
    sale = await prisma.sale.create({
      data: {
        shiftId: shift.id,
        cashierId: cashier.id,
        customerId: customer.id,
        status: 'POR_COBRAR',
        paymentMethod: 'CREDITO',
        subtotal: 14300,
        total: 14300,
        balance: 14300,
        dueDate: due,
        createdAt: atBusinessTime(past, 11, 40),
        clientOpId: 'seed-overdue-borregos',
      },
      include: { items: true },
    });
  }
  if (!sale.items.length) {
    // 22 sacos de 40 kg y 22 de 20 kg de alimento ovino de engorda = $14,300
    const pres = await presentationMap();
    const cost = PRODUCTS.find((x) => x.code === 'OV-001')!.cost;
    for (const name of ['Saco 40 kg', 'Saco 20 kg']) {
      const x = pres.get(`OV-001|${name}`)!;
      await prisma.saleItem.create({
        data: {
          saleId: sale.id,
          productId: x.productId,
          presentation: name,
          factor: x.factor,
          quantity: 22,
          unitPrice: x.price,
          total: 22 * x.price,
          costTotal: r2(22 * x.factor * cost),
        },
      });
    }
  }
}

// ---------- Rutas de reparto ----------

async function deleteRoutes(where: Prisma.RouteWhereInput) {
  const ids = (await prisma.route.findMany({ where, select: { id: true } })).map((x) => x.id);
  if (!ids.length) return;
  const stopIds = (await prisma.routeStop.findMany({ where: { routeId: { in: ids } }, select: { id: true } })).map((x) => x.id);
  await prisma.locationPing.deleteMany({ where: { routeId: { in: ids } } });
  await prisma.payment.deleteMany({ where: { routeId: { in: ids } } });
  await prisma.incident.deleteMany({ where: { routeId: { in: ids } } });
  await prisma.stopItem.deleteMany({ where: { stopId: { in: stopIds } } });
  await prisma.routeStop.deleteMany({ where: { routeId: { in: ids } } });
  await prisma.route.deleteMany({ where: { id: { in: ids } } });
}

/** Crea (o reinicia) la ruta de demostración del chofer para hoy. */
async function todayRoute() {
  const driver = await userByName('chofer');
  const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { plate: VEHICLES[0][0] } });
  const today = businessDate();
  const existing = await prisma.route.findMany({ where: { driverId: driver.id, date: today }, select: { name: true, status: true } });
  // En una base local (desarrollo y CI) la ruta de hoy se rehace siempre: routes:smoke la necesita sin iniciar
  // aunque api:smoke la haya terminado. En una base remota no se toca una ruta que ya salió o terminó.
  const local = isLocalDatabaseUrl(process.env.DATABASE_URL);
  const inUse = existing.filter((x) => x.status !== 'PROGRAMADA');
  if (inUse.length && !local) {
    console.warn(`Aviso: "chofer" ya tiene hoy ${inUse.map((x) => `"${x.name}" (${x.status})`).join(', ')}; no se toca y no se crea la ruta de hoy.`);
    return;
  }
  await deleteRoutes({ driverId: driver.id, date: today, ...(local ? {} : { status: 'PROGRAMADA' }) });

  const pres = await presentationMap();
  const clients = await seedCustomers();
  await prisma.route.create({
    data: {
      name: ZONE_TODAY,
      date: today,
      driverId: driver.id,
      vehicleId: vehicle.id,
      plannedDeparture: '07:50',
      stops: {
        create: TODAY_STOPS.map((s, i) => ({
          customerId: clients.find((x) => x.name === s.customer)!.id,
          sequence: i + 1,
          eta: s.eta,
          paymentTerms: s.terms,
          instructions: s.note,
          items: {
            create: s.items.map(([code, presentation, quantity]) => {
              const x = pres.get(`${code}|${presentation}`)!;
              return { productId: x.productId, presentation, factor: x.factor, quantity, unitPrice: x.price };
            }),
          },
        })),
      },
    },
  });
}

/** Pedidos de una parada: uno o dos productos de los que se reparten a domicilio. */
function stopOrder(r: Rand, pres: Awaited<ReturnType<typeof presentationMap>>) {
  const first = weighted(r, ROUTE_PRODUCTS, (x) => x[2]);
  const chosen = [first];
  if (r() < 0.45) {
    const second = weighted(r, ROUTE_PRODUCTS, (x) => x[2]);
    if (second[0] !== first[0]) chosen.push(second);
  }
  return chosen.map(([code, presentation]) => {
    const x = pres.get(`${code}|${presentation}`)!;
    return { productId: x.productId, presentation, factor: x.factor, quantity: r() < 0.06 ? int(r, 15, 25) : int(r, 2, 10), unitPrice: x.price };
  });
}

const FAIL_NOTES: Record<string, string> = {
  CLIENTE_AUSENTE: 'Nadie atendió; se llamó dos veces al encargado.',
  RECHAZO: 'El cliente dice que pidió otra presentación.',
  SIN_ACCESO: 'Camino cerrado por lluvia, el camión no pasa.',
  DIRECCION_INCORRECTA: 'La referencia no coincide; el cliente no contestó para confirmar.',
};
/** Días hacia atrás que cubre el historial de rutas. */
const ROUTES_WINDOW = 18;

/** Rutas terminadas de las últimas semanas (lunes a sábado, dos o tres repartidores) para el historial y la eficiencia. */
async function routeHistory() {
  const today = businessDate();
  const drivers = [await userByName('chofer'), await userByName('chofer2'), await userByName('chofer3')];
  const trucks = await Promise.all(VEHICLES.map(([plate]) => prisma.vehicle.findUniqueOrThrow({ where: { plate } })));
  // se rehace el historial: fuera las rutas de versiones anteriores, las de las pruebas automáticas y las de este mismo historial
  await deleteRoutes({
    OR: [
      { name: { startsWith: 'Ruta Hist-' } },
      { name: { contains: '(e2e)' } },
      { status: 'FINALIZADA', date: { lt: today, gte: addDays(today, -60) }, name: { in: [...ZONES, ZONE_TODAY] }, driverId: { in: drivers.map((d) => d.id) } },
    ],
  });

  const pres = await presentationMap();
  const clients = await seedCustomers();
  const days = workingDays(addDays(today, -ROUTES_WINDOW), addDays(today, -1));
  for (let i = 0; i < days.length; i++) {
    const date = days[i];
    const latest = i === days.length - 1;
    const zones = shuffle(rng(`zonas-${ymd(date)}`), ZONES);
    const active = [2, 4, 6].includes(date.getUTCDay()) ? 3 : 2; // el tercer repartidor sale martes, jueves y sábado
    for (let di = 0; di < active; di++) {
      const r = rng(`ruta-${ymd(date)}-${di}`);
      const stopsOf = shuffle(
        r,
        clients.filter((x) => x.zone === zones[di]),
      ).slice(0, int(r, 3, 5));
      const planned = 7 * 60 + 50 + di * 20;
      const departed = planned + int(r, -3, 9);
      let eta = planned + int(r, 30, 45);
      let lastMinute = departed;
      const stops = stopsOf.map((customer, k) => {
        // el día más reciente siempre trae una llegada tardía y una no entrega, para que el reporte de eficiencia tenga de todo
        const failed = (latest && di === 1 && k === 1) || r() < 0.05;
        const late = !failed && ((latest && di === 0 && k === 1) || r() < 0.12);
        const arrived = eta + (late ? int(r, 25, 55) : int(r, -12, 6));
        const delivered = arrived + int(r, 8, 25);
        lastMinute = failed ? arrived + 6 : delivered;
        const items = stopOrder(r, pres);
        const partial = !failed && items[0].quantity > 2 && r() < 0.07;
        const credit = customer.creditDays > 0 && customer.name !== OVERDUE_CUSTOMER && r() < 0.55;
        const reason = failed ? weighted(r, Object.keys(FAIL_NOTES), (x) => (x === 'CLIENTE_AUSENTE' ? 4 : x === 'RECHAZO' ? 2 : 1)) : null;
        const withQty = items.map((it, n) => ({ ...it, deliveredQty: failed ? 0 : partial && n === 0 ? it.quantity - 1 : it.quantity }));
        const stop = {
          customerId: customer.id,
          sequence: k + 1,
          eta: hhmm(eta),
          instructions: r() < 0.25 ? pick(r, STOP_NOTES) : null,
          paymentTerms: credit ? `Crédito ${customer.creditDays} días` : 'Contado',
          status: failed ? ('NO_ENTREGADA' as const) : ('ENTREGADA' as const),
          arrivedAt: atBusinessTime(date, 0, arrived),
          deliveredAt: failed ? null : atBusinessTime(date, 0, delivered),
          failReason: reason,
          failNotes: reason ? FAIL_NOTES[reason] : null,
          items: { create: withQty },
        };
        const collected = failed || credit ? 0 : r2(withQty.reduce((a, it) => a + it.deliveredQty * it.unitPrice, 0));
        const m = r();
        const method: PaymentMethod = m < 0.7 ? 'EFECTIVO' : m < 0.92 ? 'TRANSFERENCIA' : 'TARJETA';
        eta += int(r, 30, 50);
        return { stop, collected, method, paidAt: atBusinessTime(date, 0, delivered) };
      });
      const route = await prisma.route.create({
        data: {
          name: zones[di],
          date,
          driverId: drivers[di].id,
          vehicleId: trucks[di].id,
          status: 'FINALIZADA',
          plannedDeparture: hhmm(planned),
          departedAt: atBusinessTime(date, 0, departed),
          returnedAt: atBusinessTime(date, 0, lastMinute + int(r, 35, 60)),
          stops: { create: stops.map((x) => x.stop) },
        },
        include: { stops: { orderBy: { sequence: 'asc' } } },
      });
      const payments = stops
        .map((x, k) => ({ x, saved: route.stops[k], k }))
        .filter(({ x }) => x.collected > 0)
        .map(({ x, saved, k }) => ({
          routeId: route.id,
          stopId: saved.id,
          customerId: saved.customerId,
          amount: x.collected,
          method: x.method,
          receivedAt: x.paidAt,
          clientOpId: `seed-hist-${ymd(date)}-${di}-${k}`,
          userId: drivers[di].id,
        }));
      if (payments.length) await prisma.payment.createMany({ data: payments });
    }
  }
}

/** Rutas ya programadas para el siguiente día hábil (pantalla "Programadas" del supervisor). */
async function scheduledRoutes() {
  const today = businessDate();
  const date = nextWorkingDay(today);
  const drivers = [await userByName('chofer2'), await userByName('chofer3')];
  const trucks = await Promise.all([VEHICLES[1][0], VEHICLES[2][0]].map((plate) => prisma.vehicle.findUniqueOrThrow({ where: { plate } })));
  await deleteRoutes({ status: 'PROGRAMADA', date: { gt: today }, name: { in: [...ZONES] }, driverId: { in: drivers.map((d) => d.id) } });

  const pres = await presentationMap();
  const clients = await seedCustomers();
  const zones = shuffle(rng(`zonas-${ymd(date)}`), ZONES);
  for (let di = 0; di < drivers.length; di++) {
    const r = rng(`programada-${ymd(date)}-${di}`);
    const planned = 8 * 60 + 10 + di * 20;
    let eta = planned + int(r, 30, 45);
    const stops = shuffle(
      r,
      clients.filter((x) => x.zone === zones[di]),
    )
      .slice(0, 4)
      .map((customer, k) => {
        const credit = customer.creditDays > 0 && customer.name !== OVERDUE_CUSTOMER && r() < 0.55;
        const stop = {
          customerId: customer.id,
          sequence: k + 1,
          eta: hhmm(eta),
          instructions: r() < 0.25 ? pick(r, STOP_NOTES) : null,
          paymentTerms: credit ? `Crédito ${customer.creditDays} días` : 'Contado',
          items: { create: stopOrder(r, pres) },
        };
        eta += int(r, 30, 50);
        return stop;
      });
    await prisma.route.create({
      data: { name: zones[di], date, driverId: drivers[di].id, vehicleId: trucks[di].id, plannedDeparture: hhmm(planned), stops: { create: stops } },
    });
  }
}

async function main() {
  checkTarget();
  for (const [code, name] of [
    ['OVINO', 'Ovino'],
    ['BOVINO', 'Bovino'],
    ['AVES', 'Aves'],
  ]) {
    await prisma.productLine.upsert({ where: { code }, update: {}, create: { code, name } });
  }
  await users();
  await vehicles();
  await catalog();
  await customers();
  await suppliers();
  await purchases();
  await salesHistory();
  await restock();
  await overdueDemo();
  await todayRoute();
  await routeHistory();
  await scheduledRoutes();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
