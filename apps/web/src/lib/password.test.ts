import { describe, expect, it } from 'vitest';
import { checkNewPassword } from './password';

describe('checkNewPassword', () => {
  it('no marca error mientras no se escribe nada', () => {
    expect(checkNewPassword({ current: '', next: '', confirm: '' })).toEqual({ problem: null, mismatch: false, ok: false });
  });

  it('avisa si es corta o muy común', () => {
    expect(checkNewPassword({ current: 'x', next: 'corta', confirm: '' }).problem).toMatch(/al menos 10/);
    expect(checkNewPassword({ current: 'x', next: 'cambiar123', confirm: '' }).problem).toMatch(/común/);
  });

  it('avisa si lleva el nombre de usuario', () => {
    expect(checkNewPassword({ current: 'x', next: 'cajero-2026-ok', confirm: '', username: 'cajero' }).problem).toMatch(/usuario/);
  });

  it('avisa si es igual a la actual', () => {
    const c = checkNewPassword({ current: 'MiClave-Larga-1', next: 'MiClave-Larga-1', confirm: 'MiClave-Larga-1' });
    expect(c.problem).toMatch(/distinta/);
    expect(c.ok).toBe(false);
  });

  it('avisa si la confirmación no coincide', () => {
    const c = checkNewPassword({ current: 'vieja', next: 'Clave-Nueva-2026', confirm: 'Clave-Nueva-2025' });
    expect(c.mismatch).toBe(true);
    expect(c.ok).toBe(false);
  });

  it('se puede enviar solo con actual, nueva válida y confirmación igual', () => {
    expect(checkNewPassword({ current: 'vieja', next: 'Clave-Nueva-2026', confirm: 'Clave-Nueva-2026' }).ok).toBe(true);
    expect(checkNewPassword({ current: '', next: 'Clave-Nueva-2026', confirm: 'Clave-Nueva-2026' }).ok).toBe(false);
  });

  it('sin contraseña actual (la fija el administrador) basta con nueva y confirmación', () => {
    expect(checkNewPassword({ current: null, next: 'Clave-Nueva-2026', confirm: 'Clave-Nueva-2026' }).ok).toBe(true);
  });
});
