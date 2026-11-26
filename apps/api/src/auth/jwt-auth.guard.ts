import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PASSWORD_CHANGE_REQUIRED } from '../common/password';
import { PrismaService } from '../prisma.service';

export const PUBLIC_KEY = 'public';
export const Public = () => SetMetadata(PUBLIC_KEY, true);

export const ALLOW_PASSWORD_CHANGE_KEY = 'allowDuringPasswordChange';
/** La ruta se puede usar aunque el usuario aún deba elegir su contraseña (solo /auth/me y /auth/change-password). */
export const AllowDuringPasswordChange = () => SetMetadata(ALLOW_PASSWORD_CHANGE_KEY, true);

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private jwt: JwtService,
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest();
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    if (!token) throw new UnauthorizedException();
    let payload: { sub?: number; tv?: number };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException();
    }
    if (typeof payload?.sub !== 'number') throw new UnauthorizedException();
    // El rol, el estado y la versión salen de la base en cada petición: desactivar a alguien o cambiarle el rol surte efecto al instante.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, role: true, active: true, tokenVersion: true, mustChangePassword: true },
    });
    if (!user || !user.active || payload.tv !== user.tokenVersion) throw new UnauthorizedException();
    req.user = { sub: user.id, username: user.username, role: user.role, mustChangePassword: user.mustChangePassword } satisfies SessionUser;
    if (user.mustChangePassword && !this.reflector.getAllAndOverride<boolean>(ALLOW_PASSWORD_CHANGE_KEY, [ctx.getHandler(), ctx.getClass()])) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Debes elegir tu propia contraseña antes de continuar.',
        code: PASSWORD_CHANGE_REQUIRED,
      });
    }
    return true;
  }
}

/** Datos de la sesión que el guard deja en `req.user` (rol y usuario actuales, leídos de la base). */
export interface SessionUser {
  sub: number;
  username: string;
  role: Role;
  mustChangePassword: boolean;
}
/** Petición ya autenticada (solo lo que usan los controladores). */
export interface AuthedRequest {
  user: SessionUser;
}
