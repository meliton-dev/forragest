/**
 * Resumen de ventas del día (Oficina → Ventas): mostrador por caja, turnos y reparto.
 * Crea su propia caja con un nombre único para no depender del seed.
 */
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { businessDate } from '../../src/common/time';
import { PrismaService } from '../../src/prisma.service';
import { SalesReportService } from '../../src/reports/sales-report.service';

const prisma = new PrismaService();
const report = new SalesReportService(prisma);
const uid = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const register = `Caja prueba ${uid()}`;
let cashierId: number;
let shiftId: number;
const saleIds: number[] = [];

beforeAll(async () => {
  const u = await prisma.user.create({
    data: { username: `cajero-rep-${uid()}`, fullName: 'Cajera del reporte', role: 'CAJERO', passwordHash: await bcrypt.hash('x', 4) },
  });
  cashierId = u.id;
  const shift = await prisma.cashShift.create({ data: { register, cashierId, openingFloat: 500 } });
  shiftId = shift.id;
  const sale = (paymentMethod: 'EFECTIVO' | 'TARJETA', total: number, status: 'PAGADA' | 'CANCELADA' = 'PAGADA') =>
    prisma.sale.create({ data: { shiftId, cashierId, status, paymentMethod, subtotal: total, total, received: total } });
  for (const s of [await sale('EFECTIVO', 300), await sale('TARJETA', 200), await sale('EFECTIVO', 999, 'CANCELADA')]) saleIds.push(s.id);
  await prisma.creditNote.create({ data: { saleId: saleIds[0], shiftId, total: 50, refundMethod: 'EFECTIVO', reason: 'Prueba', userId: cashierId } });
});

afterAll(async () => {
  await prisma.creditNote.deleteMany({ where: { shiftId } });
  await prisma.sale.deleteMany({ where: { id: { in: saleIds } } });
  // el turno queda cerrado para no aparecer "abierto" a quien use esta base
  await prisma.cashShift.update({ where: { id: shiftId }, data: { status: 'CERRADO', closedAt: new Date() } });
  await prisma.$disconnect();
});

describe('resumen de ventas del día', () => {
  it('agrupa el mostrador por caja: formas de pago, canceladas y devoluciones', async () => {
    const r = await report.daily();
    expect(r.date).toBe(businessDate().toISOString().slice(0, 10));
    const g = r.counter.byRegister.find((x) => x.register === register)!;
    expect(g).toMatchObject({ count: 2, cancelled: 1, total: 500, refunds: 50, net: 450 });
    expect(g.byMethod).toMatchObject({ EFECTIVO: 300, TARJETA: 200 });
    expect(g.cashiers).toEqual(['Cajera del reporte']);
  });

  it('el turno abierto calcula el efectivo esperado igual que el corte', async () => {
    const s = (await report.daily()).shifts.find((x) => x.id === shiftId)!;
    // fondo 500 + efectivo 300 − devolución en efectivo 50
    expect(s).toMatchObject({ register, status: 'ABIERTO', salesCount: 2, total: 500, expectedCash: 750, countedCash: null });
  });

  it('los totales cuadran: mostrador + reparto, y la suma de las cajas y de las rutas', async () => {
    const r = await report.daily();
    const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
    expect(r.counter.total).toBe(sum(r.counter.byRegister.map((x) => x.total)));
    expect(r.delivery.delivered).toBe(sum(r.delivery.byRoute.map((x) => x.delivered)));
    expect(r.total).toBe(Math.round((r.counter.total - r.counter.refunds + r.delivery.delivered) * 100) / 100);
  });

  it('otro día no trae estas ventas, y una fecha mal escrita se rechaza', async () => {
    const r = await report.daily('2001-01-01');
    expect(r.counter.byRegister.find((x) => x.register === register)).toBeUndefined();
    await expect(report.daily('01/01/2001')).rejects.toThrow('AAAA-MM-DD');
  });
});
