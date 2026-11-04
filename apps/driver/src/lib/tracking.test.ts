import { describe, expect, it } from 'vitest';
import { shouldRecord, splitBatches } from './tracking';

describe('shouldRecord', () => {
  it('guarda una ubicación cada 30 s como mínimo', () => {
    expect(shouldRecord(0, 29_999)).toBe(false);
    expect(shouldRecord(0, 30_000)).toBe(true);
    expect(shouldRecord(1_000, 61_000)).toBe(true);
  });
  it('la primera ubicación siempre se guarda', () => {
    expect(shouldRecord(0, Date.now())).toBe(true);
  });
});

describe('splitBatches', () => {
  it('reparte las ubicaciones en lotes del tamaño máximo que acepta la API', () => {
    const items = Array.from({ length: 250 }, (_, i) => i);
    const batches = splitBatches(items, 100);
    expect(batches.map((b) => b.length)).toEqual([100, 100, 50]);
    expect(batches.flat()).toEqual(items);
  });
  it('sin ubicaciones no hay lotes', () => {
    expect(splitBatches([])).toEqual([]);
  });
});
