import { ApiError, NetworkError, PASSWORD_CHANGE_REQUIRED } from '@forrajera/shared';

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';
const TOKEN_KEY = 'fd.token';
const USER_KEY = 'fd.user';
const EXPIRED_KEY = 'fd.expired';
const TIMEOUT_MS = 20_000;
/** Se avisa cada vez que cambia la sesión (entrar, salir, nueva contraseña) para que la pantalla se actualice. */
export const SESSION_EVENT = 'fd:session';

export interface SessionUser {
  id: number;
  username: string;
  fullName: string;
  role: string;
  /** true = debe elegir su propia contraseña antes de usar la app */
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
  localStorage.removeItem(EXPIRED_KEY);
  window.dispatchEvent(new Event(SESSION_EVENT));
}
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event(SESSION_EVENT));
}
/** La sesión dejó de servir sin que la persona la cerrara: la pantalla de entrada lo explica. */
export const markExpired = () => localStorage.setItem(EXPIRED_KEY, '1');
export const wasExpired = () => localStorage.getItem(EXPIRED_KEY) === '1';

export async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    const token = getToken();
    res = await fetch(BASE + path, {
      method,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new NetworkError('Sin conexión');
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // respuesta que no es JSON (p. ej. página de error de un proxy)
    if (!res.ok) throw new ApiError(res.status >= 500 ? 'El servidor no está disponible' : 'Respuesta inesperada', res.status);
  }
  if (!res.ok) {
    const code = typeof data?.code === 'string' ? data.code : undefined;
    if (res.status === 403 && code === PASSWORD_CHANGE_REQUIRED) window.dispatchEvent(new Event('fd:password-required'));
    const msg = Array.isArray(data?.message) ? data.message.join(', ') : data?.message;
    throw new ApiError(msg ?? 'Error del servidor', res.status, code);
  }
  return data as T;
}
