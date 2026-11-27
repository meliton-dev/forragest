import { describe, expect, it } from 'vitest';
import { filterStock, stockState, type StockRow } from './inventory';

const row = (over: Partial<StockRow>): StockRow => ({
  id: 1,
  code: 'OV-001',
  name: 'Maíz quebrado',
  line: 'OVINO',
  lineName: 'Ovino',
  unit: 'kg',
  stock: 100,
  minStock: 20,
  purchasePrice: 5,
  value: 500,
  ...over,
});

describe('inventario', () => {
  it('distingue agotado, bajo mínimo y suficiente', () => {
    expect(stockState(row({ stock: 0 }))).toBe('agotado');
    expect(stockState(row({ stock: 20 }))).toBe('bajo');
    expect(stockState(row({ stock: 21 }))).toBe('bien');
    expect(stockState(row({ stock: 1, minStock: 0 }))).toBe('bien');
  });

  it('filtra por texto sin acentos, por línea y por reabastecer', () => {
    const rows = [row({}), row({ id: 2, code: 'AV-001', name: 'Postura', line: 'AVES', stock: 0 })];
    expect(filterStock(rows, { query: 'maiz', line: '', onlyLow: false }).map((r) => r.id)).toEqual([1]);
    expect(filterStock(rows, { query: '', line: 'AVES', onlyLow: false }).map((r) => r.id)).toEqual([2]);
    expect(filterStock(rows, { query: '', line: '', onlyLow: true }).map((r) => r.id)).toEqual([2]);
  });
});
