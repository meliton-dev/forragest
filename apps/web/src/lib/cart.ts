import { r2 } from './format';
import type { CatalogItem, CreditInfo, PayMethod } from './types';

export interface CartLine {
  item: CatalogItem;
  qty: number;
}

export interface Discount {
  mode: 'PERCENT' | 'AMOUNT';
  value: number;
  authorization: { username: string; password: string };
}

export interface Cart {
  lines: CartLine[];
  customer: CreditInfo | null;
  payment: PayMethod;
  received: string;
  discount: Discount | null;
}

export const emptyCart = (): Cart => ({ lines: [], customer: null, payment: 'EFECTIVO', received: '', discount: null });

export function totalsOf(cart: Cart) {
  const subtotal = r2(cart.lines.reduce((a, l) => a + r2(l.qty * l.item.price), 0));
  let discount = 0;
  if (cart.discount)
    discount = cart.discount.mode === 'PERCENT' ? r2((subtotal * Math.min(cart.discount.value, 100)) / 100) : r2(Math.min(cart.discount.value, subtotal));
  const total = r2(subtotal - discount);
  const received = Number(cart.received) || 0;
  return { subtotal, discount, total, received, change: Math.max(0, r2(received - total)) };
}

/** Importes sugeridos para cobrar en efectivo: exacto y redondeos hacia arriba. */
export function quickAmounts(total: number): number[] {
  if (total <= 0) return [];
  const up = (step: number) => Math.ceil(total / step) * step;
  return [...new Set([r2(total), up(100), up(500), up(1000)])].slice(0, 4);
}

/** ¿Se vende por kilo suelto? Solo el granel admite fracciones (2.5 kg); los sacos y demás unidades van enteros. */
export const isBulk = (item: Pick<CatalogItem, 'presentation'>) => /granel/i.test(item.presentation);

/**
 * Interpreta lo que el cajero escribió en la cantidad de una partida.
 * - qty: null si no es un número válido (vacío, cero, letras): el campo vuelve al valor anterior.
 * - clamped: se pidió más de lo que hay en existencia y se dejó el máximo.
 */
export function parseQty(text: string, max: number, decimal: boolean): { qty: number | null; clamped: boolean } {
  const t = text.trim().replace(',', '.');
  if (!/^\d*\.?\d*$/.test(t) || t === '' || t === '.') return { qty: null, clamped: false };
  let n = Number(t);
  n = decimal ? Math.round(n * 1000) / 1000 : Math.floor(n);
  if (!(n > 0)) return { qty: null, clamped: false };
  if (n > max) return { qty: max, clamped: true };
  return { qty: n, clamped: false };
}
