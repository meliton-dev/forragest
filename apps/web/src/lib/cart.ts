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
  if (cart.discount) discount = cart.discount.mode === 'PERCENT' ? r2((subtotal * Math.min(cart.discount.value, 100)) / 100) : r2(Math.min(cart.discount.value, subtotal));
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
