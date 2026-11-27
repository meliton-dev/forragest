import { ApiError, NetworkError, PASSWORD_CHANGE_REQUIRED } from '@forrajera/shared';

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';
const TOKEN_KEY = 'fw.token';
const USER_KEY = 'fw.user';
/** Se avisa cada vez que cambia la sesión (entrar, salir, nueva contraseña) para que la pantalla se actualice. */
export const SESSION_EVENT = 'fw:session';

export interface SessionUser {
  id: number;
  username: string;
  fullName: string;
  role: string;
  /** true = debe elegir su propia contraseña antes de usar el sistema */
  mustChangePassword?: boolean;
}

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const getUser = (): SessionUser | null => {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null');
  } catch {
    return null;
  }
};
export function setSession(token: string, user: SessionUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event(SESSION_EVENT));
}
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export async function api<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    const token = getToken();
    res = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new NetworkError();
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    if (!res.ok) throw new ApiError(res.status >= 500 ? 'El servidor no está disponible' : 'Respuesta inesperada', res.status);
  }
  if (!res.ok) {
    const code = typeof data?.code === 'string' ? data.code : undefined;
    // al cambiar la contraseña un 401 significa «la actual no es correcta», no «sesión vencida»
    if (res.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/change-password')) window.dispatchEvent(new Event('fw:unauthorized'));
    if (res.status === 403 && code === PASSWORD_CHANGE_REQUIRED) window.dispatchEvent(new Event('fw:password-required'));
    const msg = Array.isArray(data?.message) ? data.message.join(', ') : data?.message;
    throw new ApiError(msg ?? 'Error del servidor', res.status, code);
  }
  return data as T;
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Error desconocido');

/** Identificador único; crypto.randomUUID solo existe en HTTPS. */
export function uid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}
