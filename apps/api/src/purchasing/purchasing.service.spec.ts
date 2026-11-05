import { payableState, suggestedQuantity } from './purchasing.service';

const today = new Date(Date.UTC(2026, 10, 5));
const inDays = (n: number) => new Date(today.getTime() + n * 86_400_000);

describe('payableState', () => {
  it('una cuenta liquidada está pagada aunque ya haya vencido', () => {
    expect(payableState(1000, 1000, inDays(-10), today)).toMatchObject({ status: 'PAGADA', balance: 0 });
  });

  it('vence hoy: todavía no está vencida, pero sí por vencer', () => {
    expect(payableState(1000, 0, inDays(0), today)).toMatchObject({ status: 'POR_VENCER', daysToDue: 0 });
  });

  it('un día después del vencimiento está vencida y conserva el saldo', () => {
    expect(payableState(1000, 250.5, inDays(-1), today)).toMatchObject({ status: 'VENCIDA', balance: 749.5, daysToDue: -1 });
  });

  it('avisa con 7 días de anticipación y no antes', () => {
    expect(payableState(500, 0, inDays(7), today).status).toBe('POR_VENCER');
    expect(payableState(500, 0, inDays(8), today).status).toBe('PENDIENTE');
  });

  it('no arrastra errores de redondeo en pagos parciales', () => {
    expect(payableState(0.3, 0.1 + 0.2, inDays(3), today).status).toBe('PAGADA');
  });
});

describe('suggestedQuantity', () => {
  it('repone hasta el doble del mínimo', () => {
    expect(suggestedQuantity(200, 50, 0)).toBe(350);
  });

  it('descuenta lo que ya viene en órdenes enviadas', () => {
    expect(suggestedQuantity(200, 50, 300)).toBe(50);
  });

  it('no sugiere nada si lo pedido ya cubre el objetivo', () => {
    expect(suggestedQuantity(200, 50, 400)).toBe(0);
  });

  it('redondea hacia arriba las fracciones de unidad', () => {
    expect(suggestedQuantity(10, 0.4, 0)).toBe(20);
  });
});
