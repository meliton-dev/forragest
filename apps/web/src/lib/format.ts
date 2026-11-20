const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const hm = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
const dm = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });

export const mxn = (n: number) => money.format(n).replace('MX$', '$');
export const hhmm = (iso: string | null | undefined) => (iso ? hm.format(new Date(iso)) : '—');
export const fecha = (iso: string) => dm.format(new Date(iso));

const dmy = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
const dmyUtc = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
/** Un momento (cuándo se creó, se recibió...): en la hora local. */
export const diaCorto = (iso: string | null) => (iso ? dmy.format(new Date(iso)) : '—');
/**
 * Una fecha de calendario sin hora (vencimiento, entrega esperada). La API la guarda a medianoche UTC;
 * convertida a la hora de México caería en el día anterior, por eso se muestra en UTC tal cual.
 */
export const diaCalendario = (iso: string | null) => (iso ? dmyUtc.format(new Date(iso)) : '—');
export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const folio = (n: number) => String(n).padStart(6, '0');

export { PAY_LABEL, REFUND_LABEL, SALE_STATUS_LABEL as STATUS_LABEL } from '@forrajera/shared';
