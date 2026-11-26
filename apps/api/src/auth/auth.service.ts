import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { LoginLimiter } from '../common/login-limiter';
import { passwordProblem } from '../common/password';
import { PrismaService } from '../prisma.service';
import { sessionUser, signSession } from './session';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private limiter: LoginLimiter,
  ) {}

  async login(username: string, password: string, ip = '') {
    const key = `login:${username.trim().toLowerCase()}:${ip}`;
    this.limiter.check(key);
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
      this.limiter.fail(key);
      throw new UnauthorizedException('Credenciales inválidas');
    }
    this.limiter.succeed(key);
    return { accessToken: await signSession(this.jwt, user), user: sessionUser(user) };
  }

  /** El usuario de la sesión, leído de la base (el guard ya comprobó que existe y está activo). */
  async me(userId: number) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return sessionUser(user);
  }

  /**
   * Cambia la contraseña propia. Sube `tokenVersion`: las demás sesiones se cierran y esta sigue con el token nuevo que se devuelve.
   * Una contraseña actual equivocada responde 400 (no 401) para que la app no lo confunda con una sesión vencida.
   */
  async changePassword(userId: number, currentPassword: string, newPassword: string) {
    const key = `change-password:${userId}`;
    this.limiter.check(key);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      this.limiter.fail(key);
      throw new BadRequestException('La contraseña actual no es correcta.');
    }
    this.limiter.succeed(key);
    const problem = passwordProblem(newPassword, user.username);
    if (problem) throw new BadRequestException(problem);
    if (newPassword === currentPassword) throw new BadRequestException('La contraseña nueva debe ser distinta de la actual.');
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(newPassword, 10), mustChangePassword: false, tokenVersion: { increment: 1 } },
    });
    return { accessToken: await signSession(this.jwt, updated), user: sessionUser(updated) };
  }
}
