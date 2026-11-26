import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ALLOW_PASSWORD_CHANGE_KEY, JwtAuthGuard, PUBLIC_KEY } from './jwt-auth.guard';

const jwt = new JwtService({ secret: 'secreto-de-prueba-0123456789' });
const dbUser = { id: 7, username: 'ana', role: 'CAJERO', active: true, tokenVersion: 2, mustChangePassword: false };

function setup(user: object | null, meta: Record<string, boolean> = {}) {
  const prisma = { user: { findUnique: jest.fn().mockResolvedValue(user) } };
  const reflector = { getAllAndOverride: (key: string) => meta[key] } as unknown as Reflector;
  const guard = new JwtAuthGuard(jwt, reflector, prisma as never);
  const req: any = { headers: {} };
  const ctx = { getHandler: () => null, getClass: () => null, switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
  const run = async (payload: object | null = { sub: 7, tv: 2, role: 'ADMINISTRADOR', username: 'otro' }) => {
    if (payload) req.headers.authorization = `Bearer ${await jwt.signAsync(payload)}`;
    return guard.canActivate(ctx);
  };
  return { run, req, prisma };
}

describe('JwtAuthGuard', () => {
  it('deja pasar las rutas públicas sin token', async () => {
    const { run, prisma } = setup(dbUser, { [PUBLIC_KEY]: true });
    await expect(run(null)).resolves.toBe(true);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('sin token o con firma falsa responde 401', async () => {
    await expect(setup(dbUser).run(null)).rejects.toBeInstanceOf(UnauthorizedException);
    const { req, ctxRun } = (() => {
      const s = setup(dbUser);
      s.req.headers.authorization = 'Bearer basura';
      return { req: s.req, ctxRun: s.run };
    })();
    await expect(ctxRun(null)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(req.user).toBeUndefined();
  });

  it('toma el rol y el usuario ACTUALES de la base, no los del token', async () => {
    const { run, req } = setup(dbUser);
    await expect(run()).resolves.toBe(true);
    expect(req.user).toMatchObject({ sub: 7, username: 'ana', role: 'CAJERO', mustChangePassword: false });
  });

  it('tokenVersion distinto (o token sin tv) responde 401', async () => {
    await expect(setup(dbUser).run({ sub: 7, tv: 1 })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(setup(dbUser).run({ sub: 7 })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('usuario inactivo o inexistente responde 401', async () => {
    await expect(setup({ ...dbUser, active: false }).run()).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(setup(null).run()).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('con mustChangePassword responde 403 con el código, salvo en las rutas permitidas', async () => {
    const blocked = { ...dbUser, mustChangePassword: true };
    const err = await setup(blocked)
      .run()
      .catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.getResponse()).toEqual({
      statusCode: 403,
      message: 'Debes elegir tu propia contraseña antes de continuar.',
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
    const ok = setup(blocked, { [ALLOW_PASSWORD_CHANGE_KEY]: true });
    await expect(ok.run()).resolves.toBe(true);
    expect(ok.req.user.mustChangePassword).toBe(true);
  });
});
