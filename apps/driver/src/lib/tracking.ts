import { get, set } from 'idb-keyval';
import { useSyncExternalStore } from 'react';
import { request } from './api';
import { ApiError, NetworkError } from '@forrajera/shared';

export interface Ping {
  lat: number;
  lng: number;
  accuracy?: number;
  at: string;
}

/** idle: sin ruta en curso · active: enviando · denied: sin permiso (o sin HTTPS) · error: el GPS no responde */
export type TrackStatus = 'unsupported' | 'idle' | 'active' | 'denied' | 'error';
interface TState {
  status: TrackStatus;
  lastFixAt: string | null;
  pending: number;
}

/** Ubicaciones guardadas sin enviar, por ruta: no se mezclan con las de otra ruta u otro chofer del mismo teléfono. */
const pingsKey = (id: number) => `fd.pings.v2.${id}`;
/** Cada cuánto se guarda una ubicación para el supervisor; el GPS ya está encendido, así que casi no cuesta batería. */
export const MIN_INTERVAL_MS = 10_000;
const BATCH = 100;

/** ¿Ya pasó el intervalo mínimo desde la última ubicación guardada? */
export const shouldRecord = (lastMs: number, nowMs: number, minMs = MIN_INTERVAL_MS) => nowMs - lastMs >= minMs;

export function splitBatches<T>(items: T[], size = BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

let state: TState = { status: typeof navigator !== 'undefined' && 'geolocation' in navigator ? 'idle' : 'unsupported', lastFixAt: null, pending: 0 };
const listeners = new Set<() => void>();
const patch = (p: Partial<TState>) => {
  state = { ...state, ...p };
  listeners.forEach((l) => l());
};
/** Estado del GPS sin suscribirse (para el aviso que se le manda al supervisor). */
export const getTracking = () => state;
export const useTracking = () =>
  useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => state,
  );

let routeId: number | null = null;
let watchId: number | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let lastRecorded = 0;
let wakeLock: WakeLockSentinel | null = null;

/** Mantiene la pantalla encendida: con la pantalla apagada el navegador deja de dar ubicación y el supervisor pierde al camión. */
async function keepAwake() {
  try {
    if (document.visibilityState !== 'visible' || wakeLock || !('wakeLock' in navigator)) return;
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => (wakeLock = null));
  } catch {
    // sin permiso o sin soporte: el seguimiento sigue, solo que la pantalla puede apagarse
  }
}
const onVisible = () => {
  if (document.visibilityState === 'visible' && routeId !== null) void keepAwake();
};
function releaseAwake() {
  void wakeLock?.release().catch(() => undefined);
  wakeLock = null;
}
let buffer: Ping[] = [];

const persist = (id = routeId) => {
  if (id !== null) void set(pingsKey(id), buffer);
};

/** Envía las ubicaciones guardadas; sin conexión se conservan, y un rechazo del servidor las descarta. */
export async function flushPings() {
  // se fija la ruta al empezar: si se detiene el seguimiento a medio envío, lo que quede se guarda en la misma ruta
  const id = routeId;
  if (id === null || buffer.length === 0) return;
  for (const batch of splitBatches(buffer)) {
    try {
      await request('POST', '/driver/locations', { routeId: id, pings: batch });
    } catch (e) {
      if (e instanceof NetworkError || (e instanceof ApiError && (e.status >= 500 || e.status === 401))) break;
      // 400/403/404: esas ubicaciones no sirven (ruta cerrada o datos inválidos); no se reintentan
    }
    buffer = buffer.slice(batch.length);
    persist(id);
    patch({ pending: buffer.length });
  }
}

function onFix(pos: GeolocationPosition) {
  patch({ status: 'active', lastFixAt: new Date(pos.timestamp).toISOString() });
  const now = Date.now();
  if (!shouldRecord(lastRecorded, now)) return;
  lastRecorded = now;
  buffer.push({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy), at: new Date(pos.timestamp).toISOString() });
  persist();
  patch({ pending: buffer.length });
  void flushPings();
}

function onError(e: GeolocationPositionError) {
  patch({ status: e.code === e.PERMISSION_DENIED ? 'denied' : 'error' });
}

/** Empieza a compartir la ubicación de la ruta en curso (solo con la app abierta). */
export async function startTracking(id: number) {
  if (!('geolocation' in navigator)) return patch({ status: 'unsupported' });
  if (routeId === id && watchId !== null) return;
  stopTracking();
  routeId = id;
  buffer = (await get<Ping[]>(pingsKey(id))) ?? [];
  patch({ pending: buffer.length });
  watchId = navigator.geolocation.watchPosition(onFix, onError, { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 });
  timer = setInterval(() => void flushPings(), 60_000);
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  void keepAwake();
}

const onOnline = () => void flushPings();

export function stopTracking() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  if (timer) clearInterval(timer);
  window.removeEventListener('online', onOnline);
  document.removeEventListener('visibilitychange', onVisible);
  releaseAwake();
  watchId = null;
  timer = null;
  if (routeId !== null) void flushPings();
  routeId = null;
  if (state.status !== 'unsupported') patch({ status: 'idle' });
}
