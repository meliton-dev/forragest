import { describe, expect, it } from 'vitest';
import { newUserProblem, sortUsers, type UserRow } from './users';

const ok = { fullName: 'Ana Pérez', username: 'aperez', password: 'Pasto-Verde-2026', confirm: 'Pasto-Verde-2026' };

describe('newUserProblem', () => {
  it('acepta un usuario completo', () => {
    expect(newUserProblem(ok)).toBeNull();
  });
  it('pide nombre y usuario', () => {
    expect(newUserProblem({ ...ok, fullName: ' ' })).toMatch(/nombre/);
    expect(newUserProblem({ ...ok, username: '' })).toMatch(/usuario/);
    expect(newUserProblem({ ...ok, username: 'ana perez' })).toMatch(/espacios/);
  });
  it('revisa la contraseña con la misma regla de la API', () => {
    expect(newUserProblem({ ...ok, password: 'corta', confirm: 'corta' })).toMatch(/al menos/);
    expect(newUserProblem({ ...ok, password: 'aperez-2026-ok', confirm: 'aperez-2026-ok' })).toMatch(/nombre de usuario/);
  });
  it('pide que la confirmación coincida', () => {
    expect(newUserProblem({ ...ok, confirm: 'otra-distinta-1' })).toMatch(/no son iguales/);
  });
});

describe('sortUsers', () => {
  it('pone primero a los activos y ordena por nombre', () => {
    const u = (id: number, fullName: string, active: boolean) => ({ id, fullName, active }) as UserRow;
    const r = sortUsers([u(1, 'Zoe', true), u(2, 'Beto', false), u(3, 'Ana', true)]);
    expect(r.map((x) => x.id)).toEqual([3, 1, 2]);
  });
});
