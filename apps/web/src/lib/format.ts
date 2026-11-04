const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const hm = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
const dm = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });

export const mxn = (n: number) => money.format(n).replace('MX$', '$');
export const hhmm = (iso: string | null | undefined) => (iso ? hm.format(new Date(iso)) : '—');
export const fecha = (iso: string) => dm.format(new Date(iso));
export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const folio = (n: number) => String(n).padStart(6, '0');

export const PAY_LABEL: Record<string, string> = { EFECTIVO: 'Efectivo', TRANSFERENCIA: 'Transferencia', TARJETA: 'Tarjeta', CREDITO: 'Crédito' };
export const STATUS_LABEL: Record<string, string> = { PAGADA: 'Pagada', POR_COBRAR: 'Por cobrar', CANCELADA: 'Cancelada' };
export const REFUND_LABEL: Record<string, string> = { EFECTIVO: 'Efectivo', TARJETA: 'A tarjeta', SALDO_A_FAVOR: 'Saldo a favor' };
