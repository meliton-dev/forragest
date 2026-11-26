import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@forrajera/shared';
import { api } from './api';

const events: string[] = [];

function answer(status: number, body: unknown) {
  vi.stubGlobal('fetch', async () => ({ ok: status < 400, status, text: async () => JSON.stringify(body) }));
}

/** Llama a la API esperando que falle y devuelve el error. */
const fail = (method: 'GET' | 'POST', path: string) =>
  api(method, path).then(
    () => {
      throw new Error('debía fallar');
    },
    (e: ApiError) => e,
  );

beforeEach(() => {
  events.length = 0;
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
  vi.stubGlobal('window', { dispatchEvent: (e: Event) => void events.push(e.type) });
});
afterEach(() => vi.unstubAllGlobals());

describe('api: código de error', () => {
  it('el ApiError lleva el code del cuerpo', async () => {
    answer(403, { message: 'Elige tu contraseña', code: 'PASSWORD_CHANGE_REQUIRED' });
    const err = await fail('GET', '/pos/shift');
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(403);
    expect(err.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('un 403 con PASSWORD_CHANGE_REQUIRED avisa para mostrar la pantalla de cambio', async () => {
    answer(403, { message: 'x', code: 'PASSWORD_CHANGE_REQUIRED' });
    await api('GET', '/pos/shift').catch(() => undefined);
    expect(events).toEqual(['fw:password-required']);
  });

  it('un 403 normal no dispara nada', async () => {
    answer(403, { message: 'Sin permiso' });
    const err = await fail('GET', '/users');
    expect(err.code).toBeUndefined();
    expect(events).toEqual([]);
  });

  it('un 401 cierra la sesión, salvo al entrar o al cambiar la contraseña', async () => {
    answer(401, { message: 'No autorizado' });
    await api('GET', '/pos/shift').catch(() => undefined);
    expect(events).toEqual(['fw:unauthorized']);
    events.length = 0;
    await api('POST', '/auth/change-password', {}).catch(() => undefined);
    await api('POST', '/auth/login', {}).catch(() => undefined);
    expect(events).toEqual([]);
  });
});
