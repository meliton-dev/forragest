import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from './roles';

function ctx(role: Role | undefined, required?: Role[]) {
  const reflector = { getAllAndOverride: () => required } as unknown as Reflector;
  const context: any = {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => ({ user: role && { role } }) }),
  };
  return new RolesGuard(reflector).canActivate(context);
}

describe('RolesGuard', () => {
  it('permite sin @Roles', () => expect(ctx(Role.CAJERO)).toBe(true));
  it('permite rol listado', () => expect(ctx(Role.CAJERO, [Role.CAJERO])).toBe(true));
  it('niega rol no listado', () => expect(ctx(Role.CHOFER, [Role.CAJERO])).toBe(false));
  it('el administrador siempre pasa', () => expect(ctx(Role.ADMINISTRADOR, [Role.CAJERO])).toBe(true));
  it('niega sin usuario', () => expect(ctx(undefined, [Role.CAJERO])).toBe(false));
});
