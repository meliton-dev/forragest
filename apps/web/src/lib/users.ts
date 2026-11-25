import { passwordProblem } from '@forrajera/shared';

export interface UserRow {
  id: number;
  username: string;
  fullName: string;
  role: string;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

/** Qué falta para guardar un usuario nuevo, en palabras para la persona; null si está completo. */
export function newUserProblem(f: { fullName: string; username: string; password: string; confirm: string }): string | null {
  if (!f.fullName.trim()) return 'Escribe el nombre de la persona.';
  const u = f.username.trim();
  if (!u) return 'Escribe el usuario con el que va a entrar.';
  if (/\s/.test(u)) return 'El usuario no puede llevar espacios.';
  if (u.length > 64) return 'El usuario es demasiado largo.';
  const p = passwordProblem(f.password, u);
  if (p) return p;
  if (f.confirm !== f.password) return 'Las dos contraseñas no son iguales.';
  return null;
}

/** Orden de la tabla: primero los activos, luego por nombre. */
export const sortUsers = (list: UserRow[]): UserRow[] =>
  [...list].sort((a, b) => Number(b.active) - Number(a.active) || a.fullName.localeCompare(b.fullName, 'es'));
