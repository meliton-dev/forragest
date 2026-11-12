import { describe, expect, it } from 'vitest';
import { emptyCart, quickAmounts, totalsOf } from './cart';
import type { CatalogItem } from './types';

const item = (price: number): CatalogItem => ({
  key: `k${price}`,
  productId: 1,
  presentationId: 1,
  code: 'X',
  name: 'X',
  line: 'BOVINO',
  presentation: 'Saco',
  factor: 40,
  price,
  stockKg: 100,
  stockUnits: 2,
  low: false,
});

describe('totalsOf', () => {
  it('suma partidas, aplica descuento porcentual y calcula el cambio', () => {
    const c = {
      ...emptyCart(),
      lines: [
        { item: item(430), qty: 2 },
        { item: item(380), qty: 1 },
      ],
      received: '1200',
      discount: { mode: 'PERCENT' as const, value: 5, authorization: { username: 'a', password: 'b' } },
    };
    expect(totalsOf(c)).toEqual({ subtotal: 1240, discount: 62, total: 1178, received: 1200, change: 22 });
  });

  it('el descuento por monto nunca supera el subtotal', () => {
    const c = {
      ...emptyCart(),
      lines: [{ item: item(100), qty: 1 }],
      discount: { mode: 'AMOUNT' as const, value: 500, authorization: { username: 'a', password: 'b' } },
    };
    expect(totalsOf(c).total).toBe(0);
  });

  it('sin efectivo recibido el cambio es 0', () => {
    expect(totalsOf({ ...emptyCart(), lines: [{ item: item(50), qty: 3 }] }).change).toBe(0);
  });
});

describe('quickAmounts', () => {
  it('ofrece exacto y redondeos', () => {
    expect(quickAmounts(1240)).toEqual([1240, 1300, 1500, 2000]);
  });
  it('sin duplicados cuando el total ya es redondo', () => {
    expect(quickAmounts(1000)).toEqual([1000]);
  });
  it('total 0 no ofrece nada', () => {
    expect(quickAmounts(0)).toEqual([]);
  });
});
