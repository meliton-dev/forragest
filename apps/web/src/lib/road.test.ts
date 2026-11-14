import { describe, expect, it } from 'vitest';
import { roadKey } from './road';

describe('roadKey', () => {
  it('es igual para puntos que difieren menos de 1 m', () => {
    expect(roadKey([[20.083301, -98.363101]])).toBe(roadKey([[20.0833, -98.3631]]));
  });
  it('cambia si cambia el orden de los puntos', () => {
    const a: [number, number] = [20.1, -98.3];
    const b: [number, number] = [20.2, -98.4];
    expect(roadKey([a, b])).not.toBe(roadKey([b, a]));
  });
});
