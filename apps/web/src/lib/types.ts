import type { SalePayment } from '@forrajera/shared';
import type { SaleStatus } from '@forrajera/shared';
export type { SaleStatus };
export type PayMethod = SalePayment;

export interface CatalogItem {
  key: string;
  productId: number;
  presentationId: number | null;
  code: string;
  name: string;
  line: string;
  presentation: string;
  factor: number;
  price: number;
  stockKg: number;
  stockUnits: number;
  low: boolean;
}

export interface CreditInfo {
  id: number;
  name: string;
  rfc: string | null;
  creditLimit: number;
  creditDays: number;
  balance: number;
  overdue: number;
  available: number;
  blocked: boolean;
  reason: string | null;
}

export interface SaleItem {
  id: number;
  productId: number;
  code: string;
  name: string;
  presentation: string;
  factor: number;
  quantity: number;
  unitPrice: number;
  total: number;
  returnedQty: number;
}

export interface Store {
  name: string;
  address: string;
  rfc: string;
  phone: string;
}

export interface Sale {
  id: number;
  folio: number;
  createdAt: string;
  status: SaleStatus;
  paymentMethod: PayMethod;
  customer: { id: number; name: string } | null;
  subtotal: number;
  discountAmount: number;
  total: number;
  received: number | null;
  change: number | null;
  balance: number;
  dueDate: string | null;
  cancelReason: string | null;
  cashier: string;
  register: string;
  items: SaleItem[];
  creditNotes: { id: number; folio: number; total: number; refundMethod: string; createdAt: string }[];
  store: Store;
}

export interface SaleRow {
  id: number;
  folio: number;
  createdAt: string;
  customer: string;
  paymentMethod: PayMethod;
  total: number;
  status: SaleStatus;
  /** caja del turno en que se vendió (Caja 1, Caja 2…) */
  register: string;
  cashier: string;
}

export interface ShiftSummary {
  shift: {
    id: number;
    register: string;
    openedAt: string;
    closedAt: string | null;
    status: string;
    openingFloat: number;
    countedCash: number | null;
    difference: number | null;
  };
  salesCount: number;
  cancelledCount: number;
  total: number;
  byMethod: Record<PayMethod, { count: number; total: number }>;
  cashRefunds: number;
  creditNotesTotal: number;
  expectedCash: number;
}

export interface CreditNote {
  id: number;
  folio: number;
  total: number;
  refundMethod: string;
  reason: string;
  createdAt: string;
  saleFolio: number;
  store: Store;
  items: { name: string; presentation: string; quantity: number; amount: number }[];
}
