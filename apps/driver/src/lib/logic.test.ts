import { describe, expect, it } from 'vitest';
import { ApiError, NetworkError } from '@forrajera/shared';
import { deliveredTotal, isPartial, oldestPending, processQueue, summarize, uid } from './logic';
import type { LocalPayment, Op, Route } from './types';

const op = (id: string, extra: Partial<Op> = {}): Op => ({ id, label: id, path: '/x/' + id, body: {}, createdAt: '2026-10-30T10:00:00Z', ...extra });

describe('processQueue', () => {
  it('envía todo en orden y vacía la cola', async () => {
    const seen: string[] = [];
    const r = await processQueue([op('a'), op('b'), op('c')], async (o) => void seen.push(o.id));
    expect(seen).toEqual(['a', 'b', 'c']);
    expect(r.queue).toEqual([]);
    expect(r.sent).toBe(3);
    expect(r.stopped).toBe(false);
  });

  it('sin conexión se detiene y conserva lo pendiente en el mismo orden', async () => {
    const r = await processQueue([op('a'), op('b'), op('c')], async (o) => {
      if (o.id === 'b') throw new NetworkError();
    });
    expect(r.sent).toBe(1);
    expect(r.offline).toBe(true);
    expect(r.queue.map((o) => o.id)).toEqual(['b', 'c']);
    expect(r.queue.every((o) => !o.failed)).toBe(true);
  });

  it('un rechazo del servidor marca la operación como fallida y continúa con las demás', async () => {
    const r = await processQueue([op('a'), op('b'), op('c')], async (o) => {
      if (o.id === 'a') throw new ApiError('La parada ya fue entregada', 400);
    });
    expect(r.sent).toBe(2);
    expect(r.queue).toHaveLength(1);
    expect(r.queue[0]).toMatchObject({ id: 'a', failed: true, error: 'La parada ya fue entregada' });
  });

  it('un error 5xx detiene el envío sin marcar fallida la operación', async () => {
    const r = await processQueue([op('a'), op('b')], async () => {
      throw new ApiError('Error interno', 500);
    });
    expect(r.stopped).toBe(true);
    expect(r.offline).toBe(false);
    expect(r.queue.map((o) => o.failed)).toEqual([undefined, undefined]);
  });

  it('401 pide volver a iniciar sesión y no pierde operaciones', async () => {
    const r = await processQueue([op('a'), op('b')], async () => {
      throw new ApiError('No autorizado', 401);
    });
    expect(r.unauthorized).toBe(true);
    expect(r.queue).toHaveLength(2);
  });

  it('403 PASSWORD_CHANGE_REQUIRED detiene el envío sin marcar fallida ni perder ninguna operación', async () => {
    const r = await processQueue([op('a'), op('b')], async () => {
      throw new ApiError('Elige tu contraseña', 403, 'PASSWORD_CHANGE_REQUIRED');
    });
    expect(r.passwordRequired).toBe(true);
    expect(r.unauthorized).toBe(false);
    expect(r.stopped).toBe(true);
    expect(r.queue.map((o) => o.id)).toEqual(['a', 'b']);
    expect(r.queue.every((o) => !o.failed)).toBe(true);
  });

  it('un 403 de permisos sigue marcando la operación como fallida', async () => {
    const r = await processQueue([op('a')], async () => {
      throw new ApiError('Sin permiso', 403);
    });
    expect(r.passwordRequired).toBe(false);
    expect(r.queue[0]).toMatchObject({ id: 'a', failed: true });
  });

  it('las operaciones ya fallidas no se reenvían', async () => {
    const seen: string[] = [];
    const r = await processQueue([op('a', { failed: true, error: 'x' }), op('b')], async (o) => void seen.push(o.id));
    expect(seen).toEqual(['b']);
    expect(r.queue.map((o) => o.id)).toEqual(['a']);
  });
});

describe('summarize', () => {
  const route = {
    id: 1,
    name: 'R',
    date: '2026-10-30',
    status: 'EN_CURSO',
    departedAt: null,
    returnedAt: null,
    vehicle: { plate: 'X', name: 'X' },
    stops: [
      { id: 1, status: 'ENTREGADA', paymentTerms: 'Contado', total: 100, items: [{ productId: 1, code: 'A', name: 'A', presentation: 'Saco', quantity: 2 }] },
      { id: 2, status: 'NO_ENTREGADA', paymentTerms: 'Contado', total: 50, items: [{ productId: 1, code: 'A', name: 'A', presentation: 'Saco', quantity: 3 }] },
      { id: 3, status: 'PENDIENTE', paymentTerms: 'Contado', total: 70, items: [{ productId: 2, code: 'B', name: 'B', presentation: 'Saco', quantity: 1 }] },
      { id: 4, status: 'PENDIENTE', paymentTerms: 'Crédito 15 días', total: 30, items: [] },
    ],
  } as unknown as Route;
  const pays: LocalPayment[] = [
    { id: '1', customer: 'x', amount: 100, method: 'EFECTIVO', receivedAt: '', synced: true },
    { id: '2', customer: 'y', amount: 40, method: 'TRANSFERENCIA', receivedAt: '', synced: false },
  ];

  it('cuenta paradas, cobros y lo que regresa al almacén', () => {
    const s = summarize(route, pays);
    expect(s).toMatchObject({ total: 4, delivered: 1, failed: 1, pending: 2, collected: 140, cash: 100, pendingToCollect: 70 });
    expect(s.leftover).toEqual([
      { code: 'A', name: 'A', presentation: 'Saco', quantity: 3 },
      { code: 'B', name: 'B', presentation: 'Saco', quantity: 1 },
    ]);
  });
});

describe('entrega parcial', () => {
  const item = (id: number, quantity: number, deliveredQty?: number) => ({
    id,
    productId: id,
    code: 'A',
    name: 'A',
    presentation: 'Saco',
    quantity,
    unitPrice: 100,
    deliveredQty,
  });
  const stop = (status: string, items: ReturnType<typeof item>[]) => ({ id: 1, status, paymentTerms: 'Contado', total: 0, items });

  it('el importe usa lo entregado y lo no tocado cuenta completo', () => {
    expect(deliveredTotal(stop('PENDIENTE', [item(1, 3), item(2, 2)]) as never, { 1: 1 })).toBe(100 + 200);
  });

  it('detecta si una parada entregada fue parcial', () => {
    expect(isPartial(stop('ENTREGADA', [item(1, 3, 2)]) as never)).toBe(true);
    expect(isPartial(stop('ENTREGADA', [item(1, 3, 3)]) as never)).toBe(false);
    expect(isPartial(stop('ENTREGADA', [item(1, 3)]) as never)).toBe(false);
    expect(isPartial(stop('NO_ENTREGADA', [item(1, 3, 0)]) as never)).toBe(false);
  });

  it('lo no entregado de una parada parcial regresa al almacén', () => {
    const route = { stops: [stop('ENTREGADA', [item(1, 3, 1)]), stop('NO_ENTREGADA', [item(1, 2)])] } as unknown as Route;
    expect(summarize(route, []).leftover).toEqual([{ code: 'A', name: 'A', presentation: 'Saco', quantity: 4 }]);
  });
});

describe('uid', () => {
  it('genera identificadores distintos incluso sin crypto.randomUUID (http)', () => {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    const a = uid();
    const b = uid();
    Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true });
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(10);
  });
});

describe('oldestPending', () => {
  const at = (id: string, createdAt: string, failed = false) => ({ id, label: id, path: '/x', body: {}, createdAt, ...(failed ? { failed } : {}) });
  it('da la hora del registro más viejo sin enviar e ignora los rechazados', () => {
    expect(oldestPending([at('a', '2026-11-24T10:05:00Z'), at('b', '2026-11-24T09:00:00Z', true), at('c', '2026-11-24T10:01:00Z')])).toBe(
      '2026-11-24T10:01:00Z',
    );
  });
  it('sin pendientes es null', () => {
    expect(oldestPending([])).toBeNull();
    expect(oldestPending([at('b', '2026-11-24T09:00:00Z', true)])).toBeNull();
  });
});
