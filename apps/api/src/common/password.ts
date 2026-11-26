/**
 * Reglas de contraseña de la API.
 *
 * Es una COPIA de `passwordProblem` y las constantes de `@forrajera/shared`: la API se compila a CommonJS y en producción
 * no puede cargar en tiempo de ejecución el paquete compartido (es TypeScript sin compilar). `shared.spec.ts` comprueba
 * que ambas versiones den siempre el mismo resultado; si cambias una, cambia la otra.
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
/** Código de error (403) cuando el usuario debe elegir su propia contraseña antes de usar el sistema. */
export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';

/** Qué le falta a una contraseña nueva, en palabras para la persona; null si sirve. */
export function passwordProblem(password: string, username?: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Usa al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Usa como máximo ${PASSWORD_MAX_LENGTH} caracteres.`;
  if (username && password.trim().toLowerCase().includes(username.trim().toLowerCase())) return 'No uses tu nombre de usuario dentro de la contraseña.';
  if (/^(.)\1+$/.test(password)) return 'No repitas el mismo carácter.';
  if (['cambiar123', '1234567890', '0123456789', 'contraseña', 'contrasena', 'password12', 'qwertyuiop'].includes(password.toLowerCase()))
    return 'Esa contraseña es demasiado común.';
  return null;
}
