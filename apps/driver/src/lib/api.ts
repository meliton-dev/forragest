import { ApiError, NetworkError } from '@forrajera/shared';

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';
const TOKEN_KEY = 'fd.token';
const USER_KEY = 'fd.user';
const TIMEOUT_MS = 20_000;

export interface SessionUser {
  id: number;
  username: string;
  fullName: string;
  role: string;
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
}
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

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
    const msg = Array.isArray(data?.message) ? data.message.join(', ') : data?.message;
    throw new ApiError(msg ?? 'Error del servidor', res.status);
  }
  return data as T;
}
