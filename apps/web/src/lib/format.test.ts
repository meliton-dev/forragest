import { describe, expect, it } from 'vitest';
import { diaCalendario } from './format';

describe('diaCalendario', () => {
  it('una fecha guardada a medianoche UTC se muestra en su mismo día, sin importar la zona horaria', () => {
    // 16 nov a medianoche UTC son las 18:00 del 15 en México: debe seguir diciendo 16
    expect(diaCalendario('2026-11-16T00:00:00.000Z')).toMatch(/^16 /);
    expect(diaCalendario('2026-12-01T00:00:00.000Z')).toMatch(/^01 /);
  });

  it('sin fecha muestra una raya', () => {
    expect(diaCalendario(null)).toBe('—');
  });
});
