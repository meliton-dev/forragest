import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';

/** Lo mínimo de un usuario para armar su sesión. */
export interface SessionSource {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  tokenVersion: number;
  mustChangePassword: boolean;
}

/** El token lleva `tv` (versión): al subir `tokenVersion` en la base, los tokens anteriores dejan de servir. */
export function signSession(jwt: JwtService, user: SessionSource) {
  return jwt.signAsync({ sub: user.id, username: user.username, role: user.role, tv: user.tokenVersion });
}

/** Datos del usuario que se devuelven al cliente (nunca el hash ni la versión del token). */
export function sessionUser(user: SessionSource) {
  return { id: user.id, username: user.username, fullName: user.fullName, role: user.role, mustChangePassword: user.mustChangePassword };
}
