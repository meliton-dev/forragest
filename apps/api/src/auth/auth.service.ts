import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { LoginLimiter } from '../common/login-limiter';
import { PrismaService } from '../prisma.service';

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
    const accessToken = await this.jwt.signAsync({ sub: user.id, username: user.username, role: user.role });
    return { accessToken, user: { id: user.id, username: user.username, fullName: user.fullName, role: user.role } };
  }
}
