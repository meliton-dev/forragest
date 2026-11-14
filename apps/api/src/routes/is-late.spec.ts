import { isLate, LATE_TOLERANCE_MIN } from './routes.service';

// La hora estimada ("09:15") es hora local de México (UTC-6, sin horario de verano), sin importar la zona del servidor.
const day = new Date('2026-11-14T00:00:00Z'); // día de la ruta (columna DATE)
const at = (utc: string) => new Date(`2026-11-14T${utc}:00Z`);

describe('isLate (hora local del negocio)', () => {
  it('una entrega a las 9:20 locales para una estimada de 9:15 no es tardía (tolerancia)', () => {
    expect(LATE_TOLERANCE_MIN).toBe(15);
    expect(isLate('09:15', day, at('15:20'))).toBe(false); // 15:20 UTC = 09:20 en México
  });
  it('justo en el límite (9:30 locales) todavía cuenta como a tiempo', () => {
    expect(isLate('09:15', day, at('15:30'))).toBe(false);
  });
  it('pasada la tolerancia sí es tardía', () => {
    expect(isLate('09:15', day, at('15:31'))).toBe(true);
    expect(isLate('09:15', day, at('17:00'))).toBe(true); // 11:00 locales
  });
  it('una entrega temprano es a tiempo', () => {
    expect(isLate('09:15', day, at('14:00'))).toBe(false); // 08:00 locales
  });
  it('antes del arreglo, cualquier entrega después de las 3:30 a. m. locales se marcaba tardía en el servidor (UTC)', () => {
    // 10:00 locales con estimada 11:00: debe ser a tiempo
    expect(isLate('11:00', day, at('16:00'))).toBe(false);
  });
  it('sin hora estimada o con formato inválido nunca es tardía', () => {
    expect(isLate(null, day, at('23:00'))).toBe(false);
    expect(isLate('mañana', day, at('23:00'))).toBe(false);
  });
});
