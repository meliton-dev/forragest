import { describe, expect, it } from 'vitest';
import { mergeLive, movement } from './live';
import type { LiveRoute, MonitorRoute } from './routes-types';

const ping = (lat: number, s: number) => ({ lat, lng: -98, at: new Date(Date.UTC(2026, 10, 12, 15, 0, s)).toISOString() });
const route = (id: number, pings: ReturnType<typeof ping>[]): MonitorRoute =>
  ({ id, name: `Ruta ${id}`, lastPing: pings.at(-1) ?? null, trail: pings.map((p) => [p.lat, p.lng]), speedKmh: null }) as unknown as MonitorRoute;
const live = (id: number, recent: ReturnType<typeof ping>[], speedKmh: number | null = 30): LiveRoute => ({
  id,
  name: `Ruta ${id}`,
  driver: 'x',
  plate: 'y',
  lastPing: recent.at(-1) ?? null,
  speedKmh,
  recent,
});

describe('mergeLive', () => {
  it('agrega solo las ubicaciones más nuevas y actualiza la última y la velocidad', () => {
    const cur = [route(1, [ping(20, 0), ping(20.001, 10)])];
    const { routes, needsFull } = mergeLive(cur, [live(1, [ping(20, 0), ping(20.001, 10), ping(20.002, 20), ping(20.003, 30)], 42)]);
    expect(needsFull).toBe(false);
    expect(routes[0].trail).toEqual([
      [20, -98],
      [20.001, -98],
      [20.002, -98],
      [20.003, -98],
    ]);
    expect(routes[0].lastPing!.lat).toBe(20.003);
    expect(routes[0].speedKmh).toBe(42);
  });

  it('sin ubicaciones nuevas no duplica el recorrido', () => {
    const cur = [route(1, [ping(20, 0), ping(20.001, 10)])];
    const { routes } = mergeLive(cur, [live(1, [ping(20, 0), ping(20.001, 10)], 0)]);
    expect(routes[0].trail).toHaveLength(2);
    expect(routes[0].speedKmh).toBe(0);
  });

  it('una ruta nueva o terminada pide el detalle completo', () => {
    expect(mergeLive([route(1, [ping(20, 0)])], [live(1, [ping(20, 0)]), live(2, [ping(21, 0)])]).needsFull).toBe(true);
    const ended = mergeLive([route(1, [ping(20, 0)]), route(2, [ping(21, 0)])], [live(1, [ping(20, 0)])]);
    expect(ended.needsFull).toBe(true);
    expect(ended.routes.map((r) => r.id)).toEqual([1]);
  });

  it('el recorrido no crece sin límite', () => {
    const many = Array.from({ length: 150 }, (_, i) => ping(20 + i * 0.0001, i));
    const { routes } = mergeLive([route(1, [ping(19, -10)])], [live(1, many)]);
    expect(routes[0].trail.length).toBeLessThanOrEqual(120);
  });
});

describe('movement', () => {
  it('describe el movimiento', () => {
    expect(movement(0)).toBe('Detenido');
    expect(movement(37)).toBe('37 km/h');
    expect(movement(null)).toBeNull();
    expect(movement(undefined)).toBeNull();
  });
});
