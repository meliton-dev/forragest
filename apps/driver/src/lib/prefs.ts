import { useSyncExternalStore } from 'react';
import { getUser } from './api';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Preferencias por usuario guardadas en el teléfono: tutorial visto, consejos cerrados, permiso de ubicación. */
export const prefKey = (user: string | undefined, key: string) => `fd.pref.${user ?? 'anon'}.${key}`;

export function readPref(key: string, storage: Store = localStorage, user: string | undefined = getUser()?.username): string | null {
  try {
    return storage.getItem(prefKey(user, key));
  } catch {
    return null;
  }
}

let version = 0;
const listeners = new Set<() => void>();

export function writePref(key: string, value: string | null, storage: Store = localStorage, user: string | undefined = getUser()?.username) {
  try {
    if (value === null) storage.removeItem(prefKey(user, key));
    else storage.setItem(prefKey(user, key), value);
  } catch {
    // modo privado o almacenamiento lleno: la preferencia solo dura mientras la app está abierta
  }
  version++;
  listeners.forEach((l) => l());
}

/** Valor reactivo de una preferencia. */
export function usePref(key: string): string | null {
  useSyncExternalStore((cb) => (listeners.add(cb), () => listeners.delete(cb)), () => version);
  return readPref(key);
}
