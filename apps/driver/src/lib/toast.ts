import { useSyncExternalStore } from 'react';

export interface Toast {
  id: number;
  message: string;
  tone: 'ok' | 'warn';
  ms: number;
  undo?: () => void;
}

let current: Toast | null = null;
let seq = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function showToast(message: string, o: { tone?: 'ok' | 'warn'; ms?: number; undo?: () => void } = {}) {
  if (timer) clearTimeout(timer);
  current = { id: ++seq, message, tone: o.tone ?? 'ok', ms: o.ms ?? 3500, undo: o.undo };
  emit();
  timer = setTimeout(dismissToast, current.ms);
}

export function dismissToast() {
  if (timer) clearTimeout(timer);
  timer = null;
  current = null;
  emit();
}

export const useToast = () => useSyncExternalStore((cb) => (listeners.add(cb), () => listeners.delete(cb)), () => current);
