import { parseOsrm, pathKey, RoadPathService, straightPath } from './road-path';

const A = { lat: 20.0833, lng: -98.3631 };
const B = { lat: 20.105, lng: -98.341 };
const C = { lat: 20.062, lng: -98.411 };
const osrm = {
  code: 'Ok',
  routes: [
    {
      distance: 15870,
      duration: 1285,
      geometry: {
        coordinates: [
          [-98.3631, 20.0833],
          [-98.35, 20.09],
          [-98.341, 20.105],
        ],
      },
    },
  ],
};
const withFetch = (f: unknown) => Object.assign(new RoadPathService(), { fetchFn: f as typeof fetch });
const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) }) as unknown as Promise<Response>;

describe('ruta por calles', () => {
  const saved = process.env.ROUTING_URL;
  afterEach(() => {
    if (saved === undefined) delete process.env.ROUTING_URL;
    else process.env.ROUTING_URL = saved;
  });

  it('convierte la respuesta de OSRM a [lat, lng] con km y minutos', () => {
    const p = parseOsrm(osrm)!;
    expect(p.source).toBe('road');
    expect(p.coordinates[0]).toEqual([20.0833, -98.3631]);
    expect(p.distanceKm).toBe(15.9);
    expect(p.durationMin).toBe(21);
  });

  it('rechaza respuestas sin ruta', () => {
    expect(parseOsrm({ code: 'NoRoute', routes: [] })).toBeNull();
    expect(parseOsrm(null)).toBeNull();
    expect(parseOsrm({ code: 'Ok', routes: [{ geometry: { coordinates: [] } }] })).toBeNull();
  });

  it('pide la ruta con longitud,latitud y la guarda en caché', async () => {
    const fetchFn = jest.fn(() => ok(osrm));
    const svc = withFetch(fetchFn);
    const first = await svc.path([A, B]);
    const second = await svc.path([A, B]);
    expect(first.source).toBe('road');
    expect(second).toBe(first);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect((fetchFn.mock.calls[0] as unknown as [string])[0]).toContain('/route/v1/driving/-98.363100,20.083300;-98.341000,20.105000');
  });

  it('consultas iguales al mismo tiempo comparten una sola petición', async () => {
    const fetchFn = jest.fn(() => ok(osrm));
    const svc = withFetch(fetchFn);
    await Promise.all([svc.path([A, C]), svc.path([A, C]), svc.path([A, C])]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('si el servicio falla devuelve líneas rectas y no guarda el fallo', async () => {
    const fetchFn = jest
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockImplementation(() => ok(osrm));
    const svc = withFetch(fetchFn);
    const fail = await svc.path([B, C]);
    expect(fail).toEqual(straightPath([B, C]));
    expect(fail.source).toBe('straight');
    expect((await svc.path([B, C])).source).toBe('road'); // el siguiente intento sí funciona
  });

  it('con ROUTING_URL vacío no llama a ningún servicio externo', async () => {
    process.env.ROUTING_URL = '';
    const fetchFn = jest.fn();
    const svc = withFetch(fetchFn);
    expect((await svc.path([A, B])).source).toBe('straight');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('un solo punto no necesita servicio', async () => {
    const fetchFn = jest.fn();
    expect((await withFetch(fetchFn).path([A])).coordinates).toEqual([[A.lat, A.lng]]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('la clave de caché ignora diferencias menores a 1 m', () => {
    expect(pathKey([{ lat: 20.083301, lng: -98.363101 }])).toBe(pathKey([{ lat: 20.0833, lng: -98.3631 }]));
  });
});
