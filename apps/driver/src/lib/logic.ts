import { ApiError, NetworkError } from '@forrajera/shared';
import type { LocalPayment, Op, Route, Summary } from './types';

/** Resumen de la ruta calculado en el teléfono (funciona sin conexión). */
export function summarize(route: Route, payments: LocalPayment[]): Summary {
  const count = (s: string) => route.stops.filter((x) => x.status === s).length;
  const byMethod: Summary['byMethod'] = {};
  let collected = 0;
  for (const p of payments) {
    byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount;
    collected += p.amount;
  }
  const left = new Map<number, Summary['leftover'][number]>();
  for (const s of route.stops) {
    for (const i of s.items) {
      const rest = i.quantity - (s.status === 'ENTREGADA' ? (i.deliveredQty ?? i.quantity) : 0);
      if (rest <= 0) continue;
      const cur = left.get(i.productId) ?? { code: i.code, name: i.name, presentation: i.presentation, quantity: 0 };
      cur.quantity += rest;
      left.set(i.productId, cur);
    }
  }
  return {
    total: route.stops.length,
    delivered: count('ENTREGADA'),
    failed: count('NO_ENTREGADA'),
    pending: count('PENDIENTE'),
    collected,
    cash: byMethod.EFECTIVO ?? 0,
    byMethod,
    pendingToCollect: route.stops.filter((s) => s.status === 'PENDIENTE' && s.paymentTerms === 'Contado').reduce((a, s) => a + s.total, 0),
    leftover: [...left.values()],
  };
}

/** Importe de lo realmente entregado en una parada (entrega parcial). */
export function deliveredTotal(stop: Pick<Route['stops'][number], 'items'>, qty: Record<number, number>): number {
  return stop.items.reduce((a, i) => a + (qty[i.id] ?? i.quantity) * i.unitPrice, 0);
}

/** Una parada entregada es parcial si algún renglón se entregó incompleto. */
export function isPartial(stop: Pick<Route['stops'][number], 'status' | 'items'>): boolean {
  return stop.status === 'ENTREGADA' && stop.items.some((i) => (i.deliveredQty ?? i.quantity) < i.quantity);
}

export interface QueueResult {
  queue: Op[];
  sent: number;
  /** se cortó por falta de conexión o error del servidor: reintentar más tarde */
  stopped: boolean;
  offline: boolean;
  unauthorized: boolean;
}

/**
 * Envía las operaciones en orden. Un rechazo definitivo del servidor (400/403/404…) marca la operación
 * como fallida y sigue con las demás; sin conexión o error 5xx detiene el envío sin perder nada.
 */
export async function processQueue(queue: Op[], send: (op: Op) => Promise<unknown>, now = Date.now()): Promise<QueueResult> {
  const out: Op[] = [];
  let sent = 0;
  let stopped = false;
  let offline = false;
  let unauthorized = false;
  for (let i = 0; i < queue.length; i++) {
    const op = queue[i];
    if (stopped) {
      out.push(op);
      continue;
    }
    if (op.failed) {
      out.push(op);
      continue;
    }
    // todavía puede deshacerse: se espera para no mandar fuera de orden lo que viene después
    if (op.holdUntil && op.holdUntil > now) {
      stopped = true;
      out.push(op);
      continue;
    }
    try {
      await send(op);
      sent++;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        unauthorized = true;
        stopped = true;
        out.push(op);
      } else if (e instanceof ApiError && e.status < 500) {
        out.push({ ...op, failed: true, error: e.message });
      } else {
        stopped = true;
        offline = e instanceof NetworkError;
        out.push(op);
      }
    }
  }
  return { queue: out, sent, stopped, offline, unauthorized };
}

/**
 * Une el resultado de un envío con la cola actual. Mientras se enviaba, el repartidor pudo registrar algo nuevo
 * (hay que conservarlo) o deshacer algo retenido (hay que respetarlo); sobrescribir la cola perdería esos cambios.
 */
export function mergeQueue(snapshot: Op[], processed: Op[], current: Op[]): Op[] {
  const sentIds = new Set(snapshot.map((o) => o.id));
  const currentIds = new Set(current.map((o) => o.id));
  const removedWhileSending = new Set(snapshot.filter((o) => !currentIds.has(o.id)).map((o) => o.id));
  const addedWhileSending = current.filter((o) => !sentIds.has(o.id));
  return [...processed.filter((o) => !removedWhileSending.has(o.id)), ...addedWhileSending];
}

/** Hora del registro más viejo que sigue sin enviarse (los rechazados no cuentan), para avisarle al supervisor. */
export function oldestPending(queue: Op[]): string | null {
  const times = queue.filter((o) => !o.failed).map((o) => o.createdAt);
  return times.length ? times.reduce((a, b) => (a < b ? a : b)) : null;
}

/** Identificador único; crypto.randomUUID solo existe en HTTPS, por eso el respaldo. */
export function uid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}
