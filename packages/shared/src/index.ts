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

// ---------- usuarios y contraseñas ----------
export const ROLES = ['ADMINISTRADOR', 'CAJERO', 'ALMACENISTA', 'CHOFER', 'GERENTE_COMPRAS', 'SUPERVISOR_RUTAS'] as const;
export type RoleName = (typeof ROLES)[number];
export const ROLE_LABEL: Record<string, string> = {
  ADMINISTRADOR: 'Administrador',
  CAJERO: 'Cajero',
  ALMACENISTA: 'Almacenista',
  CHOFER: 'Chofer',
  GERENTE_COMPRAS: 'Gerente de compras',
  SUPERVISOR_RUTAS: 'Supervisor de rutas',
} satisfies Record<RoleName, string>;

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
/** Código de error (403) cuando el usuario debe elegir su propia contraseña antes de usar el sistema. */
export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';

/** Qué le falta a una contraseña nueva, en palabras para la persona; null si sirve. La API y las apps usan la misma regla. */
export function passwordProblem(password: string, username?: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Usa al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Usa como máximo ${PASSWORD_MAX_LENGTH} caracteres.`;
  if (username && password.trim().toLowerCase().includes(username.trim().toLowerCase())) return 'No uses tu nombre de usuario dentro de la contraseña.';
  if (/^(.)\1+$/.test(password)) return 'No repitas el mismo carácter.';
  if (['cambiar123', '1234567890', '0123456789', 'contraseña', 'contrasena', 'password12', 'qwertyuiop'].includes(password.toLowerCase()))
    return 'Esa contraseña es demasiado común.';
  return null;
}

export interface PasswordCheck {
  /** qué le falta a la contraseña nueva (null = sirve o todavía no se escribe nada) */
  problem: string | null;
  /** la confirmación ya tiene texto y no coincide */
  mismatch: boolean;
  /** se puede enviar */
  ok: boolean;
}

/** Validación en vivo del formulario de contraseña nueva (web y app del chofer). `current` = null cuando no se pide la actual (el admin pone la de otro). */
export function checkNewPassword(f: { current: string | null; next: string; confirm: string; username?: string }): PasswordCheck {
  const problem =
    f.next === ''
      ? null
      : f.current !== null && f.next === f.current
        ? 'La contraseña nueva debe ser distinta de la que tienes ahora.'
        : passwordProblem(f.next, f.username);
  const mismatch = f.confirm !== '' && f.confirm !== f.next;
  const ok = f.next !== '' && problem === null && f.confirm === f.next && (f.current === null || f.current !== '');
  return { problem, mismatch, ok };
}

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
    /** Código de la API cuando lo trae (p. ej. PASSWORD_CHANGE_REQUIRED). */
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
