import { describe, expect, it } from 'vitest';
import { mergeQueue, processQueue } from './logic';
import { prefKey, readPref, writePref } from './prefs';
import type { Op } from './types';

const op = (id: string, extra: Partial<Op> = {}): Op => ({ id, label: id, path: '/x', body: {}, createdAt: '', ...extra });
const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe('margen para deshacer', () => {
  it('no envía una operación en espera ni las que vienen después (mantiene el orden)', async () => {
    const sent: string[] = [];
    const r = await processQueue([op('a'), op('b', { holdUntil: 2000 }), op('c')], async (o) => void sent.push(o.id), 1000);
    expect(sent).toEqual(['a']);
    expect(r.queue.map((o) => o.id)).toEqual(['b', 'c']);
  });
  it('la envía cuando ya venció el margen', async () => {
    const sent: string[] = [];
    const r = await processQueue([op('b', { holdUntil: 2000 }), op('c')], async (o) => void sent.push(o.id), 2500);
    expect(sent).toEqual(['b', 'c']);
    expect(r.queue).toEqual([]);
  });
});

describe('preferencias por usuario', () => {
  it('se guardan separadas por usuario', () => {
    const s = mem();
    writePref('onboarded', '1', s, 'chofer');
    expect(readPref('onboarded', s, 'chofer')).toBe('1');
    expect(readPref('onboarded', s, 'chofer2')).toBeNull();
    expect(prefKey('chofer', 'gps')).toBe('fd.pref.chofer.gps');
  });
  it('si el almacenamiento falla no truena', () => {
    const roto = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
    expect(() => writePref('gps', '1', roto, 'u')).not.toThrow();
    expect(readPref('gps', roto, 'u')).toBeNull();
  });
});

describe('fusión de la cola tras un envío', () => {
  it('conserva lo registrado mientras se enviaba (antes se perdía)', () => {
    const snapshot = [op('a')];
    const current = [op('a'), op('nuevo')]; // el repartidor registró algo durante el envío
    expect(mergeQueue(snapshot, [], current).map((o) => o.id)).toEqual(['nuevo']);
  });
  it('respeta lo que se deshizo mientras se enviaba otra cosa', () => {
    const snapshot = [op('a'), op('retenida', { holdUntil: 9e12 })];
    const processed = [op('retenida', { holdUntil: 9e12 })];
    const current = [op('a')]; // se deshizo "retenida"
    expect(mergeQueue(snapshot, processed, current)).toEqual([]);
  });
  it('sin cambios externos devuelve el resultado tal cual', () => {
    const snapshot = [op('a'), op('b')];
    expect(mergeQueue(snapshot, [op('b')], snapshot).map((o) => o.id)).toEqual(['b']);
  });
});
