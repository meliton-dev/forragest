import { del, get, set as idbSet } from 'idb-keyval';
import { useSyncExternalStore } from 'react';
import { clearSession, request } from './api';
import { ApiError, NetworkError } from './errors';
import { processQueue, uid } from './logic';
import { showToast } from './toast';
import type { FailReason, IncidentType, LocalIncident, LocalPayment, Method, Op, Route } from './types';

export interface State {
  ready: boolean;
  loading: boolean;
  route: Route | null;
  noRoute: boolean;
  payments: LocalPayment[];
  incidents: LocalIncident[];
  queue: Op[];
  online: boolean;
  syncing: boolean;
  lastSync: string | null;
  error: string | null;
}

const KEY = 'fd.state.v1';
const initial: State = {
  ready: false, loading: false, route: null, noRoute: false, payments: [], incidents: [], queue: [],
  online: typeof navigator === 'undefined' ? true : navigator.onLine, syncing: false, lastSync: null, error: null,
};

let state: State = initial;
const listeners = new Set<() => void>();
let started = false;

const emit = () => listeners.forEach((l) => l());
const persist = () => {
  const { route, payments, incidents, queue, lastSync } = state;
  void idbSet(KEY, { route, payments, incidents, queue, lastSync });
};
function patch(p: Partial<State>, save = true) {
  state = { ...state, ...p };
  if (save) persist();
  emit();
}

export const getState = () => state;
export const useStore = () => useSyncExternalStore((cb) => (listeners.add(cb), () => listeners.delete(cb)), getState);
export const pendingCount = (s: State = state) => s.queue.filter((o) => !o.failed).length;

/** Carga lo guardado en el teléfono y se pone al día con la API. */
export async function init() {
  if (started) return;
  started = true;
  const saved = await get(KEY);
  if (saved) state = { ...state, ...saved };
  state = { ...state, ready: true };
  emit();
  window.addEventListener('online', () => void refresh());
  window.addEventListener('offline', () => patch({ online: false }, false));
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void refresh());
  window.addEventListener('fd:unauthorized', () => void logout());
  setInterval(() => pendingCount() > 0 && void flush(), 20_000);
  await refresh();
}

/** Sustituye lo local por lo del servidor (solo si no hay nada pendiente que se pisaría). */
async function pull() {
  patch({ loading: true, error: null }, false);
  try {
    const route = await request<Route>('GET', '/driver/route');
    const [pay, inc] = await Promise.all([
      request<{ items: { id: number; customer: string; amount: number; method: Method; receivedAt: string }[] }>('GET', `/driver/routes/${route.id}/payments`),
      request<{ id: number; type: IncidentType; description: string; createdAt: string }[]>('GET', `/driver/routes/${route.id}/incidents`),
    ]);
    patch({
      route, noRoute: false, online: true, loading: false, lastSync: new Date().toISOString(),
      payments: pay.items.map((p) => ({ id: 's' + p.id, customer: p.customer, amount: p.amount, method: p.method, receivedAt: p.receivedAt, synced: true })),
      incidents: inc.map((i) => ({ id: 's' + i.id, type: i.type, description: i.description, createdAt: i.createdAt, synced: true })),
    });
  } catch (e) {
    if (e instanceof NetworkError) patch({ online: false, loading: false }, false);
    else if (e instanceof ApiError && e.status === 404) patch({ route: null, noRoute: true, online: true, loading: false });
    else if (e instanceof ApiError && e.status === 401) void logout();
    else patch({ loading: false, error: e instanceof Error ? e.message : 'Error desconocido' }, false);
  }
}

let flushing: Promise<void> | null = null;
/** Envía la cola pendiente en orden; al terminar, si todo salió bien, actualiza desde el servidor. */
export function flush(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    patch({ syncing: true }, false);
    const r = await processQueue(state.queue, (op) => request('POST', op.path, op.body));
    patch({ queue: r.queue, syncing: false, online: !r.offline });
    if (r.unauthorized) return void (await logout());
    if (!r.stopped && !r.queue.some((o) => !o.failed)) await pull();
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

export async function refresh() {
  if (state.queue.length) await flush();
  else await pull();
}

export async function logout() {
  clearSession();
  await del(KEY);
  state = { ...initial, ready: true, online: state.online };
  emit();
  window.dispatchEvent(new Event('fd:loggedout'));
}

export function discardOp(id: string) {
  patch({ queue: state.queue.filter((o) => o.id !== id) });
  void refresh();
}

const mapStop = (id: number, fn: (s: Route['stops'][number]) => Route['stops'][number]): Route => ({
  ...state.route!,
  stops: state.route!.stops.map((s) => (s.id === id ? fn(s) : s)),
});
const enqueue = (op: Omit<Op, 'createdAt'>) => [...state.queue, { ...op, createdAt: new Date().toISOString() }];

/** Cargar el camión necesita conexión: el servidor valida y descuenta el inventario. */
export async function startRoute() {
  const r = state.route!;
  try {
    const route = await request<Route>('POST', `/driver/routes/${r.id}/start`);
    patch({ route, online: true });
  } catch (e) {
    if (e instanceof NetworkError) throw new Error('Necesitas conexión para cargar el camión y salir a ruta.');
    throw e;
  }
}

/** El repartidor llegó a la parada: se guarda la hora (también sin conexión) y se manda en orden con lo demás. */
export function arrive(stopId: number) {
  const stop = state.route!.stops.find((s) => s.id === stopId)!;
  if (stop.arrivedAt) return;
  const id = uid();
  const at = new Date().toISOString();
  patch({
    route: mapStop(stopId, (s) => ({ ...s, arrivedAt: at })),
    queue: enqueue({ id, label: `Llegada · ${stop.customer.name}`, path: `/driver/stops/${stopId}/arrive`, body: { at } }),
  });
  void flush();
}

/** Segundos que el repartidor tiene para deshacer una acción antes de que se envíe. */
export const UNDO_MS = 8000;
const hold = <T extends Omit<Op, 'createdAt'>>(op: T) => ({ ...op, holdUntil: Date.now() + UNDO_MS });
const scheduleFlush = () => setTimeout(() => void flush(), UNDO_MS + 150);

/** Quita la operación de la cola y revierte lo que se mostró; si ya se envió, avisa que no se puede deshacer. */
function undoOp(id: string, restore: () => void) {
  if (!state.queue.some((o) => o.id === id)) {
    showToast('Ya se envió al sistema. Si hay un error, avisa a tu supervisor.', { tone: 'warn', ms: 6000 });
    return;
  }
  restore();
  patch({ queue: state.queue.filter((o) => o.id !== id) });
  showToast('Acción deshecha', { ms: 2500 });
}

export function deliver(stopId: number, data: { signature?: string; photo?: string; payment?: { amount: number; method: Method } }) {
  const id = uid();
  const at = new Date().toISOString();
  const before = state.route!.stops.find((s) => s.id === stopId)!;
  const payment = data.payment && data.payment.amount > 0 ? data.payment : undefined;
  patch({
    route: mapStop(stopId, (s) => ({ ...s, status: 'ENTREGADA', deliveredAt: at })),
    payments: payment ? [{ id, customer: before.customer.name, amount: payment.amount, method: payment.method, receivedAt: at, synced: false }, ...state.payments] : state.payments,
    queue: enqueue(hold({ id, label: `Entrega · ${before.customer.name}`, path: `/driver/stops/${stopId}/deliver`, body: { clientOpId: id, deliveredAt: at, signature: data.signature, photo: data.photo, payment } })),
  });
  showToast(`Entrega registrada · ${before.customer.name}`, {
    ms: UNDO_MS,
    undo: () => undoOp(id, () => patch({ route: mapStop(stopId, () => before), payments: state.payments.filter((p) => p.id !== id) })),
  });
  void flush();
  scheduleFlush();
}

export function failStop(stopId: number, data: { reason: FailReason; notes?: string; photo?: string }) {
  const id = uid();
  const at = new Date().toISOString();
  const before = state.route!.stops.find((s) => s.id === stopId)!;
  patch({
    route: mapStop(stopId, (s) => ({ ...s, status: 'NO_ENTREGADA', failReason: data.reason })),
    incidents: [{ id, type: data.reason === 'CLIENTE_AUSENTE' ? 'CLIENTE_AUSENTE' : 'OTRO', description: `No entrega: ${data.reason}${data.notes ? ' · ' + data.notes : ''}`, createdAt: at, synced: false }, ...state.incidents],
    queue: enqueue(hold({ id, label: `No entrega · ${before.customer.name}`, path: `/driver/stops/${stopId}/fail`, body: { clientOpId: id, reason: data.reason, notes: data.notes, photo: data.photo, at } })),
  });
  showToast(`No entrega registrada · ${before.customer.name}`, {
    tone: 'warn',
    ms: UNDO_MS,
    undo: () => undoOp(id, () => patch({ route: mapStop(stopId, () => before), incidents: state.incidents.filter((i) => i.id !== id) })),
  });
  void flush();
  scheduleFlush();
}

export function addPayment(data: { customerId?: number; customerName: string; amount: number; method: Method }) {
  const id = uid();
  const at = new Date().toISOString();
  patch({
    payments: [{ id, customer: data.customerName, amount: data.amount, method: data.method, receivedAt: at, synced: false }, ...state.payments],
    queue: enqueue(hold({ id, label: `Cobro · ${data.customerName}`, path: '/driver/payments', body: { clientOpId: id, routeId: state.route!.id, customerId: data.customerId, amount: data.amount, method: data.method, receivedAt: at } })),
  });
  showToast(`Cobro guardado · ${data.customerName}`, { ms: UNDO_MS, undo: () => undoOp(id, () => patch({ payments: state.payments.filter((p) => p.id !== id) })) });
  void flush();
  scheduleFlush();
}

export function addIncident(data: { type: IncidentType; description: string; stopId?: number; photo?: string }) {
  const id = uid();
  const at = new Date().toISOString();
  patch({
    incidents: [{ id, type: data.type, description: data.description, createdAt: at, synced: false }, ...state.incidents],
    queue: enqueue({ id, label: 'Incidencia', path: '/driver/incidents', body: { clientOpId: id, routeId: state.route!.id, stopId: data.stopId, type: data.type, description: data.description, photo: data.photo, createdAt: at } }),
  });
  showToast('Incidencia enviada a tu supervisor', { ms: 3500 });
  void flush();
}

export function closeRoute() {
  const id = uid();
  const at = new Date().toISOString();
  patch({
    route: { ...state.route!, status: 'FINALIZADA', returnedAt: at },
    queue: enqueue({ id, label: 'Cierre de ruta', path: `/driver/routes/${state.route!.id}/close`, body: { returnedAt: at } }),
  });
  showToast('Ruta cerrada. ¡Buen trabajo!', { ms: 4000 });
  void flush();
}
