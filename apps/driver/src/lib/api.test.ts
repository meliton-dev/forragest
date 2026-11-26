import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@forrajera/shared';
import { request } from './api';

const events: string[] = [];

beforeEach(() => {
  events.length = 0;
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
  vi.stubGlobal('window', { dispatchEvent: (e: Event) => void events.push(e.type) });
});
afterEach(() => vi.unstubAllGlobals());

const fail = (status: number, body: unknown) => {
  vi.stubGlobal('fetch', async () => ({ ok: false, status, text: async () => JSON.stringify(body) }));
  return request('GET', '/driver/route').then(
    () => {
      throw new Error('debía fallar');
    },
    (e: ApiError) => e,
  );
};

describe('request: código de error', () => {
  it('el ApiError lleva el code y un 403 PASSWORD_CHANGE_REQUIRED avisa para mostrar el cambio de contraseña', async () => {
    const err = await fail(403, { message: 'Elige tu contraseña', code: 'PASSWORD_CHANGE_REQUIRED' });
    expect(err.status).toBe(403);
    expect(err.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect(events).toEqual(['fd:password-required']);
  });

  it('un error sin code no dispara nada', async () => {
    const err = await fail(403, { message: 'Sin permiso' });
    expect(err.code).toBeUndefined();
    expect(events).toEqual([]);
  });
});
