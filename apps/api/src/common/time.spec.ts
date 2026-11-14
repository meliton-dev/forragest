import { addDays, atBusinessTime, businessDate, startOfBusinessDay, tzOffsetMs } from './time';

const MX = 'America/Mexico_City';
// 10:42 p. m. del 14 de noviembre en México = 04:42 UTC del 15: el servidor (UTC) cree que ya es otro día
const NIGHT = new Date('2026-11-15T04:42:00Z');

describe('fechas del negocio', () => {
  const tz = process.env.TZ;
  afterEach(() => {
    if (tz === undefined) delete process.env.TZ;
    else process.env.TZ = tz;
  });

  it('"hoy" es el día local del negocio aunque el servidor ya esté en el día siguiente (UTC)', () => {
    expect(NIGHT.getUTCDate()).toBe(15); // lo que ve un servidor en UTC
    expect(businessDate(NIGHT, MX).toISOString()).toBe('2026-11-14T00:00:00.000Z');
  });

  it('no depende de la zona del servidor', () => {
    for (const z of ['UTC', 'America/Mexico_City', 'Asia/Tokyo']) {
      process.env.TZ = z;
      expect(businessDate(NIGHT, MX).toISOString()).toBe('2026-11-14T00:00:00.000Z');
    }
  });

  it('a mediodía local coinciden el día local y el UTC', () => {
    expect(businessDate(new Date('2026-11-14T18:00:00Z'), MX).toISOString()).toBe('2026-11-14T00:00:00.000Z');
  });

  it('el día local empieza a las 06:00 UTC (México es UTC-6, sin horario de verano)', () => {
    expect(startOfBusinessDay(NIGHT, MX).toISOString()).toBe('2026-11-14T06:00:00.000Z');
    expect(startOfBusinessDay(new Date('2026-11-14T07:00:00Z'), MX).toISOString()).toBe('2026-11-14T06:00:00.000Z');
    expect(startOfBusinessDay(new Date('2026-11-14T05:59:00Z'), MX).toISOString()).toBe('2026-11-13T06:00:00.000Z');
  });

  it('convierte una hora local ("09:15") del día de la ruta a instante UTC', () => {
    const day = new Date('2026-11-14T00:00:00Z');
    expect(atBusinessTime(day, 9, 15, MX).toISOString()).toBe('2026-11-14T15:15:00.000Z');
    expect(atBusinessTime(day, 9, 30, MX).toISOString()).toBe('2026-11-14T15:30:00.000Z');
    expect(atBusinessTime(day, 23, 59, MX).toISOString()).toBe('2026-11-15T05:59:00.000Z');
  });

  it('respeta el horario de verano en zonas que lo usan', () => {
    const NY = 'America/New_York';
    expect(atBusinessTime(new Date('2026-01-15T00:00:00Z'), 9, 0, NY).toISOString()).toBe('2026-01-15T14:00:00.000Z'); // UTC-5
    expect(atBusinessTime(new Date('2026-07-15T00:00:00Z'), 9, 0, NY).toISOString()).toBe('2026-07-15T13:00:00.000Z'); // UTC-4
    expect(tzOffsetMs(new Date('2026-07-15T12:00:00Z'), NY)).toBe(-4 * 3600_000);
  });

  it('suma días a una fecha de calendario', () => {
    expect(addDays(new Date('2026-11-30T00:00:00Z'), 15).toISOString()).toBe('2026-12-15T00:00:00.000Z');
  });
});
