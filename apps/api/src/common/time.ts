/**
 * Fechas del negocio. El servidor (Render) corre en UTC, pero "hoy", las horas estimadas ("09:15") y el día de las ventas
 * son de la hora local del negocio: a las 6:00 p. m. en México el reloj UTC ya marca el día siguiente.
 * Todo lo que dependa de "hoy" o de una hora local debe pasar por aquí, nunca por getDate()/getHours() del servidor.
 */
export const DEFAULT_TIMEZONE = 'America/Mexico_City';

export const businessTimezone = () => process.env.APP_TIMEZONE?.trim() || DEFAULT_TIMEZONE;

function parts(instant: Date, tz: string) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
  const v: Record<string, number> = {};
  for (const p of f.formatToParts(instant)) if (p.type !== 'literal') v[p.type] = Number(p.value);
  return v;
}

/** Diferencia (ms) entre la hora local de la zona y UTC en ese instante: negativa al oeste de Greenwich. */
export function tzOffsetMs(instant: Date, tz = businessTimezone()): number {
  const p = parts(instant, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Fecha de calendario del negocio ("hoy") como medianoche UTC, que es como se guardan las columnas DATE. */
export function businessDate(now = new Date(), tz = businessTimezone()): Date {
  const p = parts(now, tz);
  return new Date(Date.UTC(p.year, p.month - 1, p.day));
}

/** Instante en que empezó el día local del negocio (para filtrar por fecha y hora, p. ej. las ventas de hoy). */
export function startOfBusinessDay(now = new Date(), tz = businessTimezone()): Date {
  return atBusinessTime(businessDate(now, tz), 0, 0, tz);
}

/** Instante de las HH:MM locales de un día de calendario (medianoche UTC) del negocio, más minutos opcionales. */
export function atBusinessTime(day: Date, hours: number, minutes: number, tz = businessTimezone()): Date {
  const guess = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hours, minutes);
  const first = guess - tzOffsetMs(new Date(guess), tz);
  // se vuelve a medir el desfase en el resultado, por si entre medias cambia el horario de verano
  return new Date(guess - tzOffsetMs(new Date(first), tz));
}

/** Suma días a una fecha de calendario (medianoche UTC). */
export const addDays = (day: Date, days: number) => new Date(day.getTime() + days * 86_400_000);
