import { ForbiddenException, HttpException } from '@nestjs/common';
import { LoginLimiter } from '../common/login-limiter';
import { PosService } from './pos.service';

describe('PosService: autorización de supervisor', () => {
  const make = () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(null) } };
    return new PosService(prisma as never, {} as never, new LoginLimiter());
  };
  const bad = { username: 'supervisor', password: 'mal' };

  it('5 errores de una caja bloquean a esa caja con 429', async () => {
    const pos = make();
    for (let i = 0; i < 5; i++) await expect(pos.verifyAuthorization(1, bad)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(pos.verifyAuthorization(1, bad)).rejects.toBeInstanceOf(HttpException);
    await expect(pos.verifyAuthorization(1, bad)).rejects.not.toBeInstanceOf(ForbiddenException);
  });

  it('el bloqueo de un cajero no alcanza a otro cajero con el mismo supervisor', async () => {
    const pos = make();
    for (let i = 0; i < 5; i++) await expect(pos.verifyAuthorization(1, bad)).rejects.toBeInstanceOf(ForbiddenException);
    // el cajero 2 sigue pudiendo intentar: recibe "inválida" (403), no "demasiados intentos" (429)
    await expect(pos.verifyAuthorization(2, bad)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
