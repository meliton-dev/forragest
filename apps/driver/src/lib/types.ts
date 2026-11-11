import type { FailReason, IncidentType, PaymentMethod, RouteStatus, StopStatus } from '@forrajera/shared';
export type { FailReason, IncidentType, RouteStatus, StopStatus };
export type Method = PaymentMethod;

export interface Item {
  id: number;
  productId: number;
  code: string;
  name: string;
  presentation: string;
  factor: number;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Stop {
  id: number;
  sequence: number;
  status: StopStatus;
  eta: string | null;
  instructions: string | null;
  paymentTerms: string;
  arrivedAt: string | null;
  deliveredAt: string | null;
  failReason: string | null;
  customer: { id: number; name: string; address: string; phone: string | null; contact: string | null; lat: number | null; lng: number | null };
  items: Item[];
  total: number;
}

export interface Route {
  id: number;
  name: string;
  date: string;
  status: RouteStatus;
  departedAt: string | null;
  returnedAt: string | null;
  vehicle: { plate: string; name: string };
  stops: Stop[];
}

export interface LocalPayment {
  id: string;
  customer: string;
  amount: number;
  method: Method;
  receivedAt: string;
  synced: boolean;
}

export interface LocalIncident {
  id: string;
  type: IncidentType;
  description: string;
  createdAt: string;
  synced: boolean;
}

/** Operación pendiente de enviar a la API (cola sin conexión). */
export interface Op {
  id: string;
  label: string;
  path: string;
  body: unknown;
  createdAt: string;
  failed?: boolean;
  error?: string;
  /** no se envía antes de esta hora (margen para deshacer) */
  holdUntil?: number;
}

export interface Summary {
  total: number;
  delivered: number;
  failed: number;
  pending: number;
  collected: number;
  cash: number;
  byMethod: Partial<Record<Method, number>>;
  pendingToCollect: number;
  leftover: { code: string; name: string; presentation: string; quantity: number }[];
}
