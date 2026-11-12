/**
 * Lo que la API, la app del repartidor y el punto de venta deben entender igual.
 * Los valores coinciden con los enums de Prisma; apps/api/src/common/shared.spec.ts lo verifica.
 */

// ---------- estados y catálogos ----------
export const ROUTE_STATUSES = ['PROGRAMADA', 'EN_CURSO', 'FINALIZADA'] as const;
export type RouteStatus = (typeof ROUTE_STATUSES)[number];

export const STOP_STATUSES = ['PENDIENTE', 'ENTREGADA', 'NO_ENTREGADA'] as const;
export type StopStatus = (typeof STOP_STATUSES)[number];

/** Formas de cobro en ruta. */
export const PAYMENT_METHODS = ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Formas de pago en el punto de venta (incluye crédito). */
export const SALE_PAYMENTS = ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'CREDITO'] as const;
export type SalePayment = (typeof SALE_PAYMENTS)[number];

export const SALE_STATUSES = ['PAGADA', 'POR_COBRAR', 'CANCELADA'] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

export const REFUND_METHODS = ['EFECTIVO', 'TARJETA', 'SALDO_A_FAVOR'] as const;
export type RefundMethod = (typeof REFUND_METHODS)[number];

export const INCIDENT_TYPES = ['CLIENTE_AUSENTE', 'PRODUCTO_DANADO', 'RETRASO', 'OTRO'] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

/** Motivos de no entrega (en la base es texto libre; la API valida contra esta lista). */
export const FAIL_REASONS = ['CLIENTE_AUSENTE', 'RECHAZO', 'DIRECCION_INCORRECTA', 'SIN_ACCESO', 'OTRO'] as const;
export type FailReason = (typeof FAIL_REASONS)[number];

// ---------- etiquetas para pantalla ----------
// `satisfies` obliga a cubrir cada valor; el tipo `Record<string, string>` permite buscar con el texto que manda el servidor.
export const ROUTE_STATUS_LABEL: Record<string, string> = { PROGRAMADA: 'Programada', EN_CURSO: 'En curso', FINALIZADA: 'Finalizada' } satisfies Record<
  RouteStatus,
  string
>;
export const FAIL_LABEL: Record<string, string> = {
  CLIENTE_AUSENTE: 'Cliente ausente',
  RECHAZO: 'Rechazo del producto',
  DIRECCION_INCORRECTA: 'Dirección incorrecta',
  SIN_ACCESO: 'Sin acceso al predio',
  OTRO: 'Otro motivo',
} satisfies Record<FailReason, string>;
export const INCIDENT_LABEL: Record<string, string> = {
  CLIENTE_AUSENTE: 'Cliente ausente',
  PRODUCTO_DANADO: 'Producto dañado',
  RETRASO: 'Retraso',
  OTRO: 'Otra incidencia',
} satisfies Record<IncidentType, string>;
export const PAY_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  TARJETA: 'Tarjeta',
  CREDITO: 'Crédito',
} satisfies Record<SalePayment, string>;
export const SALE_STATUS_LABEL: Record<string, string> = { PAGADA: 'Pagada', POR_COBRAR: 'Por cobrar', CANCELADA: 'Cancelada' } satisfies Record<
  SaleStatus,
  string
>;
export const REFUND_LABEL: Record<string, string> = { EFECTIVO: 'Efectivo', TARJETA: 'A tarjeta', SALDO_A_FAVOR: 'Saldo a favor' } satisfies Record<
  RefundMethod,
  string
>;

// ---------- errores de red ----------
/** No hubo respuesta del servidor (sin señal, tiempo agotado). */
export class NetworkError extends Error {
  constructor(message = 'No hay conexión con el servidor') {
    super(message);
    this.name = 'NetworkError';
  }
}

/** El servidor respondió con un error. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
