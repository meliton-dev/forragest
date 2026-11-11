/**
 * Pruebas de integración del punto de venta: crédito, devoluciones y cancelaciones.
 * Crean sus propios usuarios, clientes y productos; no dependen del estado del seed.
 */
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { LoginLimiter } from '../../src/common/login-limiter';
import { InventoryService } from '../../src/inventory/inventory.service';
import { PosService } from '../../src/pos/pos.service';
import { PrismaService } from '../../src/prisma.service';

const prisma = new PrismaService();
const inventory = new InventoryService(prisma);
const pos = new PosService(prisma, inventory, new LoginLimiter());
const uid = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const sup = { username: '', password: 'clave-sup' };
let cashierId: number;

beforeAll(async () => {
  const hash = await bcrypt.hash(sup.password, 4);
  sup.username = `sup-${uid()}`;
  await prisma.user.create({ data: { username: sup.username, fullName: 'Supervisor prueba', role: 'SUPERVISOR_RUTAS', passwordHash: hash } });
  const cashier = await prisma.user.create({ data: { username: `caj-${uid()}`, fullName: 'Cajero prueba', role: 'CAJERO', passwordHash: hash } });
  cashierId = cashier.id;
  await pos.openShift(cashierId, 1000);
});
afterAll(() => prisma.$disconnect());

async function product(price: number, stock = 1000) {
  const line = await prisma.productLine.findFirstOrThrow();
  const code = `T-${uid()}`;
  const p = await prisma.product.create({ data: { code, name: code, lineId: line.id, unit: 'kg', purchasePrice: price / 2, salePrice: price } });
  if (stock) await inventory.addEntry({ productId: p.id, quantity: stock, unitCost: price / 2 });
  return p;
}
const customer = (creditLimit: number, creditDays = 15) =>
  prisma.customer.create({ data: { name: `Cliente ${uid()}`, address: 'x', creditLimit, creditDays } });
const cash = (productId: number, quantity: number, extra: object = {}) =>
  pos.createSale(cashierId, { items: [{ productId, quantity }], paymentMethod: 'EFECTIVO', ...extra });
const onCredit = (productId: number, quantity: number, customerId: number) =>
  pos.createSale(cashierId, { items: [{ productId, quantity }], paymentMethod: 'CREDITO', customerId });
const giveBack = (saleId: number, saleItemId: number, quantity: number) =>
  pos.createReturn(cashierId, { saleId, items: [{ saleItemId, quantity }], reason: 'prueba' });

describe('crédito', () => {
  it('vende a crédito: queda por cobrar con vencimiento según los días del cliente', async () => {
    const p = await product(100);
    const c = await customer(1000, 15);
    const s = await onCredit(p.id, 3, c.id);
    expect(s.status).toBe('POR_COBRAR');
    expect(s.balance).toBe(300);
    const due = new Date(s.dueDate!);
    const days = Math.round((due.getTime() - Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())) / 864e5);
    expect(days).toBe(15);
    expect((await pos.creditOf(c.id)).available).toBe(700);
  });

  it('rechaza clientes sin crédito, con saldo vencido o sin disponible suficiente', async () => {
    const p = await product(100);
    await expect(onCredit(p.id, 1, (await customer(0)).id)).rejects.toThrow(/no tiene crédito/);

    const late = await customer(1000);
    const s = await onCredit(p.id, 1, late.id);
    await prisma.sale.update({ where: { id: s.id }, data: { dueDate: new Date('2020-01-01') } });
    await expect(onCredit(p.id, 1, late.id)).rejects.toThrow(/saldo vencido/);

    await expect(onCredit(p.id, 11, (await customer(1000)).id)).rejects.toThrow(/excede el crédito/);
  });

  it('ventas a crédito simultáneas no rebasan el límite del cliente', async () => {
    const p = await product(100);
    const c = await customer(1000);
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => onCredit(p.id, 4, c.id)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect((await pos.creditOf(c.id)).balance).toBe(800);
  });
});

describe('devoluciones', () => {
  it('regresa el producto al inventario y prorratea el descuento', async () => {
    const p = await product(100);
    const s = await cash(p.id, 4, { discountPercent: 10, authorization: sup }); // 400 - 10% = 360
    const note = await giveBack(s.id, s.items[0].id, 1);
    expect(note.total).toBe(90);
    expect(await inventory.stockOf(p.id)).toBe(997);
  });

  it('no permite devolver más de lo vendido, ni repitiendo la partida en la misma solicitud', async () => {
    const p = await product(100);
    const s = await cash(p.id, 2);
    await expect(giveBack(s.id, s.items[0].id, 3)).rejects.toThrow(/Solo se pueden devolver/);
    await expect(
      pos.createReturn(cashierId, {
        saleId: s.id,
        items: [
          { saleItemId: s.items[0].id, quantity: 2 },
          { saleItemId: s.items[0].id, quantity: 2 },
        ],
        reason: 'x',
      }),
    ).rejects.toThrow(/Solo se pueden devolver/);
    expect(await inventory.stockOf(p.id)).toBe(998);
  });

  it('devoluciones simultáneas de la misma partida no devuelven de más', async () => {
    const p = await product(100);
    const s = await cash(p.id, 2);
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => giveBack(s.id, s.items[0].id, 1)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(await inventory.stockOf(p.id)).toBe(1000);
  });

  it('la suma de las notas de crédito nunca supera el total de la venta (redondeo)', async () => {
    const p = await product(10);
    const s = await cash(p.id, 3, { discountAmount: 0.01, authorization: sup }); // total 29.99
    let refunded = 0;
    for (let i = 0; i < 3; i++) refunded += (await giveBack(s.id, s.items[0].id, 1)).total;
    expect(Math.round(refunded * 100) / 100).toBe(29.99);
  });

  it('en una venta a crédito descuenta el saldo, también con devoluciones simultáneas', async () => {
    const p = await product(100);
    const c = await customer(1000);
    const s = await onCredit(p.id, 4, c.id);
    await Promise.all([giveBack(s.id, s.items[0].id, 1), giveBack(s.id, s.items[0].id, 1)]);
    expect((await pos.getSale(s.id)).balance).toBe(200);
  });
});

describe('cancelaciones', () => {
  it('no se puede devolver una venta cancelada ni cancelar una con devoluciones', async () => {
    const p = await product(100);
    const a = await cash(p.id, 1);
    await pos.cancelSale(cashierId, a.id, { reason: 'x', authorization: sup });
    await expect(giveBack(a.id, a.items[0].id, 1)).rejects.toThrow(/cancelada/);

    const b = await cash(p.id, 2);
    await giveBack(b.id, b.items[0].id, 1);
    await expect(pos.cancelSale(cashierId, b.id, { reason: 'x', authorization: sup })).rejects.toThrow(/devoluciones/);
    expect(await inventory.stockOf(p.id)).toBe(999);
  });

  it('cancelar dos veces a la vez solo regresa el producto una vez', async () => {
    const p = await product(100);
    const s = await cash(p.id, 5);
    await Promise.allSettled([1, 2, 3].map(() => pos.cancelSale(cashierId, s.id, { reason: 'x', authorization: sup })));
    expect(await inventory.stockOf(p.id)).toBe(1000);
  });

  it('cancelar y devolver a la vez no regresa el producto dos veces', async () => {
    const p = await product(100);
    const s = await cash(p.id, 5);
    await Promise.allSettled([pos.cancelSale(cashierId, s.id, { reason: 'x', authorization: sup }), giveBack(s.id, s.items[0].id, 5)]);
    expect(await inventory.stockOf(p.id)).toBe(1000);
  });
});
