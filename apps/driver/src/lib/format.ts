const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const time = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
const day = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'short' });

export const mxn = (n: number) => money.format(n).replace('MX$', '$');
export const hhmm = (iso: string | null | undefined) => (iso ? time.format(new Date(iso)) : '—');
export const longDay = (iso: string) => day.format(new Date(iso + 'T12:00:00'));
export const num = (n: number) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(n);

export const FAIL_LABEL: Record<string, string> = {
  CLIENTE_AUSENTE: 'Cliente ausente',
  RECHAZO: 'Rechazo del producto',
  DIRECCION_INCORRECTA: 'Dirección incorrecta',
  SIN_ACCESO: 'Sin acceso al predio',
  OTRO: 'Otro motivo',
};
export const INCIDENT_LABEL: Record<string, string> = {
  CLIENTE_AUSENTE: 'Cliente ausente',
  PRODUCTO_DANADO: 'Producto dañado',
  RETRASO: 'Retraso',
  OTRO: 'Otra incidencia',
};
export const METHOD_LABEL: Record<string, string> = { EFECTIVO: 'Efectivo', TRANSFERENCIA: 'Transferencia', TARJETA: 'Tarjeta' };
