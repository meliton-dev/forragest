import { BadRequestException, HttpException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { LoginLimiter } from '../common/login-limiter';
import { AuthService } from './auth.service';

const jwt = new JwtService({ secret: 'secreto-de-prueba-0123456789' });

async function setup() {
  const row: any = {
    id: 3,
    username: 'luis',
    fullName: 'Luis',
    role: 'CHOFER',
    active: true,
    passwordHash: await bcrypt.hash('clave-actual-123', 4),
    tokenVersion: 5,
    mustChangePassword: true,
  };
  const prisma = {
    user: {
      findUnique: jest.fn().mockImplementation(async () => row),
      findUniqueOrThrow: jest.fn().mockImplementation(async () => row),
      update: jest.fn().mockImplementation(async ({ data }: any) => {
        row.passwordHash = data.passwordHash;
        row.mustChangePassword = data.mustChangePassword;
        row.tokenVersion += data.tokenVersion.increment;
        return row;
      }),
    },
  };
  return { svc: new AuthService(prisma as never, jwt, new LoginLimiter()), prisma, row };
}

describe('AuthService.login', () => {
  it('devuelve mustChangePassword y un token con la versión (tv)', async () => {
    const { svc } = await setup();
    const r = await svc.login('luis', 'clave-actual-123');
    expect(r.user).toEqual({ id: 3, username: 'luis', fullName: 'Luis', role: 'CHOFER', mustChangePassword: true });
    expect(jwt.decode(r.accessToken)).toMatchObject({ sub: 3, tv: 5 });
    expect(JSON.stringify(r)).not.toContain('passwordHash');
  });
});

describe('AuthService.changePassword', () => {
  it('con la actual equivocada responde 400 y no cambia nada', async () => {
    const { svc, prisma } = await setup();
    await expect(svc.changePassword(3, 'incorrecta', 'otra-clave-nueva-1')).rejects.toThrow('La contraseña actual no es correcta.');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('frena los intentos tras 5 fallos', async () => {
    const { svc } = await setup();
    for (let i = 0; i < 5; i++) await svc.changePassword(3, 'mal', 'otra-clave-nueva-1').catch(() => undefined);
    await expect(svc.changePassword(3, 'clave-actual-123', 'otra-clave-nueva-1')).rejects.toBeInstanceOf(HttpException);
    expect(await svc.changePassword(3, 'clave-actual-123', 'otra-clave-nueva-1').catch((e) => e.getStatus())).toBe(429);
  });

  it('rechaza una nueva débil, con el usuario dentro o igual a la actual', async () => {
    const { svc, prisma } = await setup();
    await expect(svc.changePassword(3, 'clave-actual-123', 'corta')).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.changePassword(3, 'clave-actual-123', 'mi-luis-secreta')).rejects.toThrow('nombre de usuario');
    await expect(svc.changePassword(3, 'clave-actual-123', 'clave-actual-123')).rejects.toThrow('distinta de la actual');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('éxito: guarda el hash, quita la bandera, sube tokenVersion y devuelve un token nuevo', async () => {
    const { svc, row } = await setup();
    const r = await svc.changePassword(3, 'clave-actual-123', 'otra-clave-nueva-1');
    expect(row.mustChangePassword).toBe(false);
    expect(row.tokenVersion).toBe(6);
    expect(await bcrypt.compare('otra-clave-nueva-1', row.passwordHash)).toBe(true);
    expect(jwt.decode(r.accessToken)).toMatchObject({ sub: 3, tv: 6 });
    expect(r.user.mustChangePassword).toBe(false);
  });
});
