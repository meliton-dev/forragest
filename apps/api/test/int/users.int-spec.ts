/**
 * Contraseñas propias, de punta a punta con la aplicación completa por HTTP:
 * login con bandera -> 403 en otra ruta -> cambio de contraseña -> token viejo 401 -> token nuevo 200,
 * y la administración de usuarios por un ADMINISTRADOR. Crea sus propios usuarios; no depende del seed.
 */
import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma.service';

const uid = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
let app: INestApplication;
let prisma: PrismaService;
let base: string;

async function api(method: string, path: string, token?: string, body?: object) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null, text };
}
const login = async (username: string, password: string) => (await api('POST', '/auth/login', undefined, { username, password })).json;

async function seedUser(role: 'ADMINISTRADOR' | 'CAJERO', password: string, mustChangePassword: boolean) {
  const username = `t-${role === 'CAJERO' ? 'caj' : 'adm'}-${uid()}`;
  const user = await prisma.user.create({
    data: { username, fullName: `Prueba ${username}`, role, passwordHash: await bcrypt.hash(password, 4), mustChangePassword },
  });
  return { ...user, password };
}

/** La bitácora se escribe después de responder: se espera a que aparezca. */
async function waitForAudit(userId: number) {
  for (let i = 0; i < 50; i++) {
    const row = await prisma.auditLog.findFirst({ where: { userId } });
    if (row) return row;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('No apareció la anotación en la bitácora');
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(0);
  base = await app.getUrl();
  base = base.replace('[::1]', 'localhost');
  prisma = app.get(PrismaService);
});
afterAll(() => app.close());

describe('cambio de contraseña obligatorio', () => {
  it('flujo completo', async () => {
    const u = await seedUser('CAJERO', 'clave-inicial-1', true);
    const first = await login(u.username, u.password);
    expect(first.user.mustChangePassword).toBe(true);
    const old = first.accessToken;

    // bloqueado en cualquier otra ruta, con el código para que la app lo reconozca
    const blocked = await api('GET', '/pos/catalog', old);
    expect(blocked.status).toBe(403);
    expect(blocked.json).toEqual({ statusCode: 403, message: 'Debes elegir tu propia contraseña antes de continuar.', code: 'PASSWORD_CHANGE_REQUIRED' });

    // /auth/me sí funciona
    const me = await api('GET', '/auth/me', old);
    expect(me.status).toBe(200);
    expect(me.json).toEqual({ id: u.id, username: u.username, fullName: u.fullName, role: 'CAJERO', mustChangePassword: true });

    // errores de la nueva contraseña
    expect((await api('POST', '/auth/change-password', old, { currentPassword: 'mal', newPassword: 'una-clave-nueva-1' })).status).toBe(400);
    expect((await api('POST', '/auth/change-password', old, { currentPassword: u.password, newPassword: 'corta' })).status).toBe(400);
    expect((await api('POST', '/auth/change-password', old, { currentPassword: u.password, newPassword: u.password })).status).toBe(400);

    const changed = await api('POST', '/auth/change-password', old, { currentPassword: u.password, newPassword: 'una-clave-nueva-1' });
    expect(changed.status).toBe(201);
    expect(changed.json.user.mustChangePassword).toBe(false);
    expect(changed.text).not.toContain('passwordHash');

    expect((await api('GET', '/auth/me', old)).status).toBe(401); // el token viejo ya no sirve
    const fresh = changed.json.accessToken;
    expect((await api('GET', '/auth/me', fresh)).json.mustChangePassword).toBe(false);
    expect((await api('GET', '/pos/catalog', fresh)).status).toBe(200);
    expect((await api('POST', '/auth/login', undefined, { username: u.username, password: u.password })).status).toBe(401);
    expect((await login(u.username, 'una-clave-nueva-1')).accessToken).toBeTruthy();

    // la contraseña no queda en la bitácora
    const audit = await prisma.auditLog.findMany({ where: { userId: u.id, entity: '/auth/change-password' } });
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain('una-clave-nueva-1');
  });
});

describe('administración de usuarios', () => {
  it('el administrador crea, pone contraseña, desactiva; los demás no entran', async () => {
    const admin = await seedUser('ADMINISTRADOR', 'clave-admin-123', false);
    const cashier = await seedUser('CAJERO', 'clave-cajero-123', false);
    const adminToken = (await login(admin.username, admin.password)).accessToken;
    const cashierToken = (await login(cashier.username, cashier.password)).accessToken;

    expect((await api('GET', '/users', cashierToken)).status).toBe(403);
    const list = await api('GET', '/users', adminToken);
    expect(list.status).toBe(200);
    expect(list.text).not.toMatch(/passwordHash|tokenVersion/);
    expect(list.json.find((x: any) => x.id === admin.id)).toMatchObject({ username: admin.username, role: 'ADMINISTRADOR', active: true });

    const username = `t-nuevo-${uid()}`;
    const created = await api('POST', '/users', adminToken, {
      username: username.toUpperCase(),
      fullName: 'Persona Nueva',
      role: 'ALMACENISTA',
      password: 'clave-inicial-xyz',
    });
    expect(created.status).toBe(201);
    expect(created.json).toMatchObject({ username, role: 'ALMACENISTA', active: true, mustChangePassword: true });
    expect(created.text).not.toMatch(/passwordHash|tokenVersion/);
    expect((await api('POST', '/users', adminToken, { username, fullName: 'Otra', role: 'CAJERO', password: 'clave-inicial-xyz' })).status).toBe(409);
    expect((await api('POST', '/users', adminToken, { username: 'ab', fullName: 'X', role: 'CAJERO', password: 'clave-inicial-xyz' })).status).toBe(400);
    expect((await api('POST', '/users', adminToken, { username: `t-${uid()}`, fullName: 'X', role: 'CAJERO', password: 'corta' })).status).toBe(400);

    // la persona nueva entra con la contraseña inicial pero debe cambiarla
    const first = await login(username, 'clave-inicial-xyz');
    expect(first.user.mustChangePassword).toBe(true);

    // el administrador le pone otra: su sesión se cierra
    const reset = await api('POST', `/users/${created.json.id}/password`, adminToken, { password: 'clave-del-admin-77' });
    expect(reset.status).toBe(201);
    expect(reset.json.user.mustChangePassword).toBe(true);
    expect(reset.json).not.toHaveProperty('accessToken');
    expect((await api('GET', '/auth/me', first.accessToken)).status).toBe(401);
    expect((await login(username, 'clave-del-admin-77')).accessToken).toBeTruthy();

    // desactivar: sus tokens dejan de servir y no puede volver a entrar
    const token2 = (await login(username, 'clave-del-admin-77')).accessToken;
    const patched = await api('PATCH', `/users/${created.json.id}`, adminToken, { active: false });
    expect(patched.status).toBe(200);
    expect(patched.json.active).toBe(false);
    expect((await api('GET', '/auth/me', token2)).status).toBe(401);
    expect((await api('POST', '/auth/login', undefined, { username, password: 'clave-del-admin-77' })).status).toBe(401);

    // cambiar de rol cierra las sesiones y el rol nuevo se nota al instante
    const promoted = await api('PATCH', `/users/${cashier.id}`, adminToken, { role: 'SUPERVISOR_RUTAS' });
    expect(promoted.json.role).toBe('SUPERVISOR_RUTAS');
    expect((await api('GET', '/auth/me', cashierToken)).status).toBe(401);

    // protecciones sobre sí mismo
    expect((await api('PATCH', `/users/${admin.id}`, adminToken, { active: false })).status).toBe(400);
    expect((await api('PATCH', `/users/${admin.id}`, adminToken, { role: 'CAJERO' })).status).toBe(400);
    expect((await api('PATCH', '/users/999999999', adminToken, { active: false })).status).toBe(404);

    // borrar: solo quien nunca trabajó en el sistema
    expect((await api('DELETE', `/users/${admin.id}`, adminToken)).status).toBe(400);
    expect((await api('DELETE', '/users/999999999', adminToken)).status).toBe(404);
    const worker = await seedUser('CAJERO', 'clave-cajero-123', false);
    await prisma.cashShift.create({ data: { register: `Caja borrar ${uid()}`, cashierId: worker.id, openingFloat: 0, status: 'CERRADO' } });
    const refused = await api('DELETE', `/users/${worker.id}`, adminToken);
    expect(refused.status).toBe(409);
    expect(refused.json.message).toContain('turnos de caja: 1');
    expect(await prisma.user.findUnique({ where: { id: worker.id } })).not.toBeNull();

    // quien solo cambió su contraseña sí se puede borrar y la bitácora conserva quién era
    const spare = await seedUser('CAJERO', 'clave-cajero-123', true);
    const spareToken = (await login(spare.username, spare.password)).accessToken;
    expect((await api('DELETE', `/users/${admin.id}`, spareToken)).status).toBe(403);
    await api('POST', '/auth/change-password', spareToken, { currentPassword: spare.password, newPassword: 'una-clave-nueva-2' });
    const audit = await waitForAudit(spare.id);
    const removed = await api('DELETE', `/users/${spare.id}`, adminToken);
    expect(removed.status).toBe(200);
    expect(removed.json).toEqual({ id: spare.id, username: spare.username });
    expect(await prisma.user.findUnique({ where: { id: spare.id } })).toBeNull();
    expect(await prisma.auditLog.findUnique({ where: { id: audit.id } })).toMatchObject({ userId: null, payload: { usuarioBorrado: spare.username } });

    // si se cambia su propia contraseña recibe un token nuevo y su sesión sigue
    const own = await api('POST', `/users/${admin.id}/password`, adminToken, { password: 'mi-clave-nueva-99' });
    expect(own.status).toBe(201);
    expect((await api('GET', '/auth/me', adminToken)).status).toBe(401);
    expect((await api('GET', '/users', own.json.accessToken)).status).toBe(200);
  });
});
