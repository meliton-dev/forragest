import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Op } from './types';

/**
 * Lo guardado sin conexión nunca se pierde: ni si la sesión vence, ni si el chofer cierra sesión, ni si entra otra
 * persona en el mismo teléfono. Y el supervisor recibe el estado de la app. Se prueba el almacén real con la base del
 * teléfono (idb-keyval), la API y el GPS simulados.
 */
const idb = new Map<string, unknown>();
let user: { id: number } | null;
let token: string | null;
const request = vi.fn();
const events: string[] = [];
let gps = 'active';

vi.mock('idb-keyval', () => ({
  get: async (k: string) => idb.get(k),
  set: async (k: string, v: unknown) => void idb.set(k, v),
  del: async (k: string) => void idb.delete(k),
}));
vi.mock('./api', () => ({
  request: (...a: unknown[]) => request(...a),
  getToken: () => token,
  getUser: () => user,
  clearSession: () => {
    token = null;
    user = null;
  },
}));
vi.mock('./tracking', () => ({ getTracking: () => ({ status: gps, lastFixAt: null, pending: 0 }) }));

/** Error de la API creado con la misma copia del paquete que usa el almacén (vi.resetModules crea una nueva en cada prueba). */
async function apiError(message: string, status: number) {
  const { ApiError } = await import('@forrajera/shared');
  return new ApiError(message, status);
}
async function networkError() {
  const { NetworkError } = await import('@forrajera/shared');
  return new NetworkError();
}

const key = (id: number) => `fd.state.v2.${id}`;
const op = (id: string, createdAt = '2026-11-24T10:00:00Z'): Op => ({ id, label: id, path: '/driver/payments', body: { clientOpId: id }, createdAt });
const route = { id: 1, status: 'EN_CURSO', stops: [] };
const saved = (queue: Op[]) => ({ route, payments: [], incidents: [], queue, lastSync: null });
const queueOf = (id: number) => (idb.get(key(id)) as { queue: Op[] } | undefined)?.queue.map((o) => o.id);
const posted = () => request.mock.calls.filter(([m]) => m === 'POST').map(([, p, b]) => [p, b] as [string, any]);

/** El servidor responde bien a la lectura de la ruta; `send` decide qué pasa con cada envío. */
function server(send: (path: string, body: any) => unknown) {
  request.mockImplementation(async (method: string, path: string, body: unknown) => {
    if (method === 'GET' && path === '/driver/route') return route;
    if (method === 'GET' && path.endsWith('/payments')) return { items: [] };
    if (method === 'GET') return [];
    return send(path, body);
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  idb.clear();
  events.length = 0;
  request.mockReset();
  token = 'token';
  user = { id: 7 };
  gps = 'active';
  vi.stubGlobal('window', { addEventListener: () => undefined, dispatchEvent: (e: Event) => void events.push(e.type) });
  vi.stubGlobal('document', { addEventListener: () => undefined, visibilityState: 'visible' });
  vi.stubGlobal('navigator', { onLine: true });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('registros sin enviar', () => {
  it('sin señal se conservan en el teléfono en el mismo orden', async () => {
    idb.set(key(7), saved([op('a'), op('b')]));
    server(async () => {
      throw await networkError();
    });
    const store = await import('./store');
    await store.init();
    expect(queueOf(7)).toEqual(['a', 'b']);
    expect(store.pendingCount()).toBe(2);
  });

  it('al volver la señal se envían solos y la cola queda vacía', async () => {
    idb.set(key(7), saved([op('a'), op('b')]));
    let up = false;
    const received: string[] = []; // lo que de verdad llegó al servidor
    server(async (path, body) => {
      if (!up) throw await networkError();
      if (path === '/driver/payments') received.push(body.clientOpId);
      return { ok: true };
    });
    const store = await import('./store');
    await store.init();
    expect(queueOf(7)).toEqual(['a', 'b']);
    up = true;
    await store.refresh(); // lo que hace la app al recibir el evento "online" (o cada 20 s)
    expect(queueOf(7)).toEqual([]);
    expect(received).toEqual(['a', 'b']); // cada registro una sola vez y en orden
    await store.refresh(); // otra vuelta con la cola vacía no reenvía nada
    expect(received).toEqual(['a', 'b']);
  });

  it('un 401 (sesión vencida) cierra la sesión pero no borra nada', async () => {
    idb.set(key(7), saved([op('a'), op('b')]));
    server(async () => {
      throw await apiError('No autorizado', 401);
    });
    const store = await import('./store');
    await store.init();
    expect(token).toBeNull();
    expect(events).toContain('fd:loggedout');
    expect(queueOf(7)).toEqual(['a', 'b']);
  });

  it('al volver a entrar la misma persona, lo pendiente se envía', async () => {
    idb.set(key(7), saved([op('a')]));
    server(async () => {
      throw await apiError('No autorizado', 401);
    });
    const store = await import('./store');
    await store.init();
    expect(token).toBeNull();

    token = 'nuevo';
    user = { id: 7 };
    server(async () => ({ ok: true }));
    await store.init();
    expect(queueOf(7)).toEqual([]);
    expect(posted().some(([p, b]) => p === '/driver/payments' && b.clientOpId === 'a')).toBe(true);
  });

  it('cerrar sesión tampoco borra lo que no se pudo enviar', async () => {
    idb.set(key(7), saved([op('a')]));
    server(async () => {
      throw await networkError();
    });
    const store = await import('./store');
    await store.init();
    await store.logout();
    expect(token).toBeNull();
    expect(queueOf(7)).toEqual(['a']);
  });

  it('otro chofer en el mismo teléfono no ve ni envía lo del anterior', async () => {
    idb.set(key(7), saved([op('a')]));
    server(async () => {
      throw await networkError();
    });
    const store = await import('./store');
    await store.init();
    await store.logout();
    request.mockClear();

    token = 'otro';
    user = { id: 9 };
    server(async () => ({ ok: true }));
    await store.init();
    expect(store.getState().queue).toEqual([]);
    expect(posted().some(([p]) => p === '/driver/payments')).toBe(false);
    expect(queueOf(7)).toEqual(['a']); // sigue esperando a su dueño
  });

  it('lo guardado con la versión anterior (sin dueño) pasa al chofer que tiene la sesión', async () => {
    idb.set('fd.state.v1', saved([op('viejo')]));
    server(async () => {
      throw await networkError();
    });
    const store = await import('./store');
    await store.init();
    expect(queueOf(7)).toEqual(['viejo']);
    expect(idb.has('fd.state.v1')).toBe(false);
  });
});

describe('estado para el supervisor', () => {
  it('reporta pendientes, el más viejo, rechazados y GPS de la ruta en curso', async () => {
    gps = 'denied';
    idb.set(key(7), saved([op('b', '2026-11-24T10:05:00Z'), op('a', '2026-11-24T10:01:00Z'), { ...op('x'), failed: true }]));
    server(async () => {
      throw await networkError();
    });
    const store = await import('./store');
    await store.init();

    server(async () => ({ ok: true }));
    request.mockClear();
    await store.reportStatus();
    const [[path, body]] = posted();
    expect(path).toBe('/driver/status');
    expect(body).toEqual({ routeId: 1, pending: 2, oldestPendingAt: '2026-11-24T10:01:00Z', rejected: 1, gps: 'denied' });
  });

  it('sin ruta en curso no reporta nada', async () => {
    idb.set(key(7), { ...saved([]), route: { ...route, status: 'PROGRAMADA' } });
    server(async () => ({ ok: true }));
    request.mockImplementation(async (method: string, path: string) => {
      if (method === 'GET' && path === '/driver/route') return { ...route, status: 'PROGRAMADA' };
      if (method === 'GET' && path.endsWith('/payments')) return { items: [] };
      if (method === 'GET') return [];
      return { ok: true };
    });
    const store = await import('./store');
    await store.init();
    request.mockClear();
    await store.reportStatus();
    expect(posted()).toEqual([]);
  });

  it('si no hay señal, el aviso falla en silencio (sin errores para el chofer)', async () => {
    idb.set(key(7), saved([]));
    server(async () => {
      throw await networkError();
    });
    const store = await import('./store');
    await store.init();
    await expect(store.reportStatus()).resolves.toBeUndefined();
  });
});
