import { BadRequestException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { UsersService } from './users.service';

const jwt = new JwtService({ secret: 'secreto-de-prueba-0123456789' });
const stored = (over: object = {}) => ({
  id: 1,
  username: 'admin',
  fullName: 'Admin',
  role: 'ADMINISTRADOR',
  active: true,
  mustChangePassword: false,
  createdAt: new Date(0),
  passwordHash: 'HASH-SECRETO',
  tokenVersion: 4,
  ...over,
});
/** Como Prisma con `select`: solo devuelve los campos pedidos. */
const pick = (row: any, select?: Record<string, boolean>) => (select ? Object.fromEntries(Object.keys(select).map((k) => [k, row[k]])) : row);

function setup(rows: any[] = [stored()]) {
  const prisma = {
    user: {
      findMany: jest.fn().mockImplementation(async ({ select }: any) => rows.map((r) => pick(r, select))),
      findUnique: jest.fn().mockImplementation(async ({ where }: any) => rows.find((r) => r.id === where.id) ?? null),
      create: jest.fn().mockImplementation(async ({ data, select }: any) => pick({ ...stored(), ...data, id: 99 }, select)),
      update: jest.fn().mockImplementation(async ({ where, data, select }: any) => {
        const row = rows.find((r) => r.id === where.id);
        const { tokenVersion, ...rest } = data;
        Object.assign(row, Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined))); // Prisma ignora los undefined
        if (tokenVersion) row.tokenVersion += tokenVersion.increment;
        return pick(row, select);
      }),
    },
  };
  return { svc: new UsersService(prisma as never, jwt), prisma, rows };
}

describe('UsersService', () => {
  it('nunca devuelve passwordHash ni tokenVersion', async () => {
    const { svc } = setup([stored(), stored({ id: 2, username: 'caja', role: 'CAJERO', fullName: 'Ana' })]);
    const all = [
      ...(await svc.list()),
      await svc.create({ username: 'nuevo', fullName: 'Nuevo', role: 'CAJERO', password: 'clave-larga-segura' }),
      await svc.update(2, { fullName: 'Ana M.' }, 1),
      (await svc.setPassword(2, { password: 'otra-clave-larga-1' }, 1)).user,
    ];
    for (const u of all) {
      expect(u).not.toHaveProperty('passwordHash');
      expect(u).not.toHaveProperty('tokenVersion');
    }
    expect(JSON.stringify(all)).not.toContain('HASH-SECRETO');
  });

  it('ordena por rol y luego por nombre', async () => {
    const { svc } = setup([
      stored({ id: 2, role: 'CHOFER', fullName: 'Zeta' }),
      stored({ id: 3, role: 'CAJERO', fullName: 'Beto' }),
      stored({ id: 4, role: 'CHOFER', fullName: 'Aldo' }),
      stored(),
    ]);
    expect((await svc.list()).map((u) => u.fullName)).toEqual(['Admin', 'Beto', 'Aldo', 'Zeta']);
  });

  it('crea con la bandera activa por omisión y valida la contraseña', async () => {
    const { svc, prisma } = setup();
    const u = await svc.create({ username: 'nuevo', fullName: 'Nuevo', role: 'CAJERO', password: 'clave-larga-segura' });
    expect(u.mustChangePassword).toBe(true);
    expect(prisma.user.create.mock.calls[0][0].data.passwordHash).not.toBe('clave-larga-segura');
    await expect(svc.create({ username: 'nuevo', fullName: 'N', role: 'CAJERO', password: 'corta' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.create({ username: 'nuevo', fullName: 'N', role: 'CAJERO', password: 'xxnuevoxxxx' })).rejects.toThrow('nombre de usuario');
  });

  it('un usuario repetido responde 409', async () => {
    const { svc, prisma } = setup();
    prisma.user.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    await expect(svc.create({ username: 'admin', fullName: 'X', role: 'CAJERO', password: 'clave-larga-segura' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('un administrador no puede desactivarse ni quitarse el rol a sí mismo', async () => {
    const { svc, prisma } = setup();
    await expect(svc.update(1, { active: false }, 1)).rejects.toThrow('No puedes desactivarte');
    await expect(svc.update(1, { role: 'CAJERO' }, 1)).rejects.toThrow('rol de administrador');
    expect(prisma.user.update).not.toHaveBeenCalled();
    await expect(svc.update(1, { fullName: 'Nuevo nombre', role: 'ADMINISTRADOR' }, 1)).resolves.toMatchObject({ fullName: 'Nuevo nombre' });
  });

  it('desactivar o cambiar de rol sube tokenVersion; renombrar no', async () => {
    const { svc, rows } = setup([stored(), stored({ id: 2, username: 'caja', role: 'CAJERO', tokenVersion: 0 })]);
    await svc.update(2, { fullName: 'Otro nombre' }, 1);
    expect(rows[1].tokenVersion).toBe(0);
    await svc.update(2, { role: 'ALMACENISTA' }, 1);
    expect(rows[1].tokenVersion).toBe(1);
    await svc.update(2, { active: false }, 1);
    expect(rows[1].tokenVersion).toBe(2);
  });

  it('PATCH de un usuario inexistente responde 404', async () => {
    await expect(setup().svc.update(50, { active: false }, 1)).rejects.toThrow('Usuario no encontrado');
  });

  it('poner contraseña sube tokenVersion; a otro le exige cambiarla y a sí mismo le da token nuevo', async () => {
    const { svc, rows } = setup([stored(), stored({ id: 2, username: 'caja', role: 'CAJERO', tokenVersion: 0 })]);
    const other = await svc.setPassword(2, { password: 'clave-larga-segura' }, 1);
    expect(other).not.toHaveProperty('accessToken');
    expect(other.user.mustChangePassword).toBe(true);
    expect(rows[1].tokenVersion).toBe(1);
    const mine = await svc.setPassword(1, { password: 'clave-larga-segura' }, 1);
    expect(rows[0].tokenVersion).toBe(5);
    expect(jwt.decode((mine as any).accessToken)).toMatchObject({ sub: 1, tv: 5 });
    expect(mine.user.mustChangePassword).toBe(false);
    await expect(svc.setPassword(2, { password: 'corta' }, 1)).rejects.toBeInstanceOf(BadRequestException);
  });
});
