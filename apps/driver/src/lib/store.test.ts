import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Op } from './types';

/**
 * Qué pasa con lo guardado sin conexión cuando el token deja de servir. Se prueba el almacén real
 * con la base del teléfono (idb-keyval) y la API simuladas.
 */
const idb = new Map<string, unknown>();
let user: { id: number; mustChangePassword?: boolean } | null;
let token: string | null;
const request = vi.fn();
const events: string[] = [];

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
  markExpired: () => events.push('expired'),
}));

/** Error de la API creado con la misma copia del paquete que usa el almacén (vi.resetModules crea una nueva en cada prueba). */
async function apiError(message: string, status: number, code?: string) {
  const { ApiError } = await import('@forrajera/shared');
  return new ApiError(message, status, code);
}

const KEY = 'fd.state.v1';
const op = (id: string): Op => ({ id, label: id, path: '/driver/payments', body: { clientOpId: id }, createdAt: '2026-11-19T10:00:00Z' });
const route = { id: 1, status: 'EN_CURSO', stops: [] };
const saved = (owner: number | undefined, queue: Op[]) => ({ route, payments: [], incidents: [], queue, lastSync: null, owner });

/** El servidor responde bien a la lectura de la ruta; `send` decide qué pasa al enviar la cola. */
function server(send: (path: string) => unknown) {
  request.mockImplementation(async (method: string, path: string) => {
    if (method === 'GET' && path === '/driver/route') return route;
    if (method === 'GET' && path.endsWith('/payments')) return { items: [] };
    if (method === 'GET') return [];
    return send(path);
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  idb.clear();
  events.length = 0;
  request.mockReset();
  token = 'viejo';
  user = { id: 7 };
  vi.stubGlobal('window', { addEventListener: () => undefined, dispatchEvent: (e: Event) => void events.push(e.type) });
  vi.stubGlobal('document', { addEventListener: () => undefined, visibilityState: 'visible' });
  vi.stubGlobal('navigator', { onLine: true });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('cola sin enviar y sesión vencida', () => {
  it('un 401 cierra la sesión pero conserva la cola guardada', async () => {
    idb.set(KEY, saved(7, [op('a'), op('b')]));
    server(async () => {
      throw await apiError('No autorizado', 401);
    });
    const store = await import('./store');
    await store.init();

    expect(token).toBeNull(); // se salió de la sesión
    expect(events).toContain('fd:loggedout');
    expect(events).toContain('expired');
    expect((idb.get(KEY) as { queue: Op[] }).queue.map((o) => o.id)).toEqual(['a', 'b']); // y nada se perdió
  });

  it('al volver a entrar la misma persona, la cola se envía', async () => {
    idb.set(KEY, saved(7, [op('a'), op('b')]));
    server(async () => {
      throw await apiError('No autorizado', 401);
    });
    const store = await import('./store');
    await store.init();

    // entra de nuevo con la contraseña nueva
    token = 'nuevo';
    user = { id: 7 };
    const sent: string[] = [];
    server((path) => void sent.push(path));
    request.mockClear();
    await store.init();
    const posts = request.mock.calls.filter((c) => c[0] === 'POST').length;

    expect(posts).toBe(2);
    expect(store.getState().queue).toEqual([]);
    expect((idb.get(KEY) as { queue: Op[] }).queue).toEqual([]);
  });

  it('si entra otra persona, no recibe ni envía lo guardado por la anterior', async () => {
    idb.set(KEY, saved(7, [op('a')]));
    token = 'otro';
    user = { id: 9 };
    server(() => undefined);
    const store = await import('./store');
    await store.init();

    expect(request.mock.calls.some((c) => c[0] === 'POST')).toBe(false);
    expect(store.getState().queue).toEqual([]);
  });

  it('lo guardado antes de esta regla (sin dueño) se respeta', async () => {
    idb.set(KEY, saved(undefined, [op('a')]));
    server(() => undefined);
    const store = await import('./store');
    await store.init();
    expect(request.mock.calls.filter((c) => c[0] === 'POST')).toHaveLength(1);
  });

  it('un 403 PASSWORD_CHANGE_REQUIRED no borra ni marca como fallida la cola, ni cierra la sesión', async () => {
    idb.set(KEY, saved(7, [op('a')]));
    server(async () => {
      throw await apiError('Elige tu contraseña', 403, 'PASSWORD_CHANGE_REQUIRED');
    });
    const store = await import('./store');
    await store.init();

    expect(token).toBe('viejo');
    expect(events).not.toContain('fd:loggedout');
    const q = store.getState().queue;
    expect(q.map((o) => o.id)).toEqual(['a']);
    expect(q[0].failed).toBeUndefined();
    expect((idb.get(KEY) as { queue: Op[] }).queue).toHaveLength(1);
  });

  it('mientras falta elegir contraseña no se intenta enviar nada', async () => {
    idb.set(KEY, saved(7, [op('a')]));
    user = { id: 7, mustChangePassword: true };
    server(() => undefined);
    const store = await import('./store');
    await store.init();
    expect(request).not.toHaveBeenCalled();
    expect(store.getState().queue).toHaveLength(1);
  });
});
