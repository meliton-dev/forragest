const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const hm = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
const dm = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });

export const mxn = (n: number) => money.format(n).replace('MX$', '$');
export const hhmm = (iso: string | null | undefined) => (iso ? hm.format(new Date(iso)) : '—');
export const fecha = (iso: string) => dm.format(new Date(iso));
export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const folio = (n: number) => String(n).padStart(6, '0');

export { PAY_LABEL, REFUND_LABEL, SALE_STATUS_LABEL as STATUS_LABEL } from '@forrajera/shared';
