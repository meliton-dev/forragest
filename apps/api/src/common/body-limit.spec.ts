import { HttpException } from '@nestjs/common';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { bodyParsers, isImageRoute } from './body-limit';

describe('isImageRoute', () => {
  it('solo las rutas del chofer con firma o foto aceptan imágenes grandes', () => {
    expect(isImageRoute('/driver/stops/12/deliver')).toBe(true);
    expect(isImageRoute('/driver/stops/12/fail')).toBe(true);
    expect(isImageRoute('/driver/incidents')).toBe(true);
    expect(isImageRoute('/driver/locations')).toBe(false);
    expect(isImageRoute('/driver/payments')).toBe(false);
    expect(isImageRoute('/driver/stops/12/arrive')).toBe(false);
    expect(isImageRoute('/auth/login')).toBe(false);
    expect(isImageRoute('/pos/sales')).toBe(false);
  });
});

describe('bodyParsers (servidor HTTP real)', () => {
  const mw = bodyParsers();
  const server = createServer((req, res) => {
    // Express agrega req.path; aquí se imita
    const r = req as typeof req & { path: string; body?: unknown };
    r.path = (req.url ?? '').split('?')[0];
    mw(r, res, (err) => {
      // el filtro global de Nest solo respeta el código si el error es HttpException; si no, respondería 500
      res.statusCode = err ? (err instanceof HttpException ? err.getStatus() : 500) : 200;
      res.end();
    });
  }).listen(0);
  const url = (p: string) => `http://127.0.0.1:${(server.address() as AddressInfo).port}${p}`;
  const post = (p: string, bytes: number) =>
    fetch(url(p), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ x: 'a'.repeat(bytes) }) });

  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  it('un cuerpo pequeño pasa en cualquier ruta (ubicaciones en lote, cobros, login)', async () => {
    expect((await post('/driver/locations', 150_000)).status).toBe(200);
    expect((await post('/driver/payments', 1000)).status).toBe(200);
    expect((await post('/auth/login', 100)).status).toBe(200);
  });

  it('un cuerpo de 1 MB se rechaza con 413 fuera de las rutas con imágenes', async () => {
    expect((await post('/auth/login', 1_000_000)).status).toBe(413);
    expect((await post('/pos/sales', 1_000_000)).status).toBe(413);
    expect((await post('/driver/locations', 1_000_000)).status).toBe(413);
  });

  it('las rutas con firma o foto aceptan varios MB y no más de 10', async () => {
    expect((await post('/driver/stops/5/deliver', 6_000_000)).status).toBe(200);
    expect((await post('/driver/incidents', 6_000_000)).status).toBe(200);
    expect((await post('/driver/stops/5/fail', 11_000_000)).status).toBe(413);
  });

  it('un JSON mal formado responde 400, no 500', async () => {
    const res = await fetch(url('/auth/login'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"x":' });
    expect(res.status).toBe(400);
  });
});
