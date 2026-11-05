export type StopStatus = 'PENDIENTE' | 'ENTREGADA' | 'NO_ENTREGADA';
export type RouteStatus = 'PROGRAMADA' | 'EN_CURSO' | 'FINALIZADA';
export type Method = 'EFECTIVO' | 'TRANSFERENCIA' | 'TARJETA';
export type IncidentType = 'CLIENTE_AUSENTE' | 'PRODUCTO_DANADO' | 'RETRASO' | 'OTRO';
export type FailReason = 'CLIENTE_AUSENTE' | 'RECHAZO' | 'DIRECCION_INCORRECTA' | 'SIN_ACCESO' | 'OTRO';

export interface Item {
  id: number;
  productId: number;
  code: string;
  name: string;
  presentation: string;
  factor: number;
  quantity: number;
  /** lo realmente entregado (solo cuenta si la parada está ENTREGADA) */
  deliveredQty?: number;
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
