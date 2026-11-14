import { distanceM, speedKmh } from './live';

const t = (s: number) => new Date(Date.UTC(2026, 10, 12, 15, 0, s));

describe('ubicación en vivo', () => {
  it('mide la distancia entre dos puntos', () => {
    // 0.01° de latitud ≈ 1,112 m
    const d = distanceM({ lat: 20, lng: -98 }, { lat: 20.01, lng: -98 });
    expect(Math.round(d)).toBeGreaterThan(1100);
    expect(Math.round(d)).toBeLessThan(1125);
  });

  it('calcula la velocidad entre las dos últimas ubicaciones', () => {
    // ~111 m en 10 s ≈ 40 km/h
    const v = speedKmh([
      { lat: 20, lng: -98, at: t(0) },
      { lat: 20.001, lng: -98, at: t(10) },
    ]);
    expect(v).toBeGreaterThanOrEqual(39);
    expect(v).toBeLessThanOrEqual(41);
  });

  it('usa solo los dos últimos puntos', () => {
    const v = speedKmh([
      { lat: 20, lng: -98, at: t(0) },
      { lat: 20.05, lng: -98, at: t(10) },
      { lat: 20.05, lng: -98, at: t(20) },
    ]);
    expect(v).toBe(0);
  });

  it('el temblor del GPS sin moverse cuenta como detenido', () => {
    expect(
      speedKmh([
        { lat: 20, lng: -98, at: t(0) },
        { lat: 20.00002, lng: -98, at: t(10) },
      ]),
    ).toBe(0);
  });

  it('un salto imposible del GPS no se muestra como velocidad', () => {
    // 1.1 km en 5 s ≈ 800 km/h
    expect(
      speedKmh([
        { lat: 20, lng: -98, at: t(0) },
        { lat: 20.01, lng: -98, at: t(5) },
      ]),
    ).toBeNull();
  });

  it('no inventa velocidad con un solo punto, mucha separación o reloj hacia atrás', () => {
    expect(speedKmh([{ lat: 20, lng: -98, at: t(0) }])).toBeNull();
    expect(
      speedKmh([
        { lat: 20, lng: -98, at: t(0) },
        { lat: 20.01, lng: -98, at: t(600) },
      ]),
    ).toBeNull();
    expect(
      speedKmh([
        { lat: 20, lng: -98, at: t(10) },
        { lat: 20.01, lng: -98, at: t(0) },
      ]),
    ).toBeNull();
  });
});
