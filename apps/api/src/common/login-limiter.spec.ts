import { HttpException } from '@nestjs/common';
import { LoginLimiter } from './login-limiter';

describe('LoginLimiter', () => {
  it('bloquea tras 5 fallos y se libera a los 15 minutos', () => {
    const l = new LoginLimiter();
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) {
      expect(() => l.check('k', t0)).not.toThrow();
      l.fail('k', t0);
    }
    expect(() => l.check('k', t0)).toThrow(HttpException);
    expect(() => l.check('otra', t0)).not.toThrow();
    expect(() => l.check('k', t0 + 15 * 60 * 1000)).not.toThrow();
  });

  it('un acceso correcto reinicia el contador', () => {
    const l = new LoginLimiter();
    for (let i = 0; i < 4; i++) l.fail('k');
    l.succeed('k');
    for (let i = 0; i < 4; i++) l.fail('k');
    expect(() => l.check('k')).not.toThrow();
  });
});

describe('LoginLimiter: llaves largas', () => {
  it('una llave enorme no ocupa memoria y se sigue bloqueando', () => {
    const l = new LoginLimiter();
    const key = 'login:' + 'x'.repeat(1_000_000) + ':1.2.3.4';
    for (let i = 0; i < 5; i++) l.fail(key);
    expect(() => l.check(key)).toThrow(HttpException);
    const stored = [...(l as unknown as { failures: Map<string, unknown> }).failures.keys()];
    expect(stored).toHaveLength(1);
    expect(stored[0].length).toBeLessThan(100);
    l.succeed(key);
    expect(() => l.check(key)).not.toThrow();
  });

  it('llaves largas distintas no se mezclan', () => {
    const l = new LoginLimiter();
    const base = 'x'.repeat(500);
    for (let i = 0; i < 5; i++) l.fail(base + 'a');
    expect(() => l.check(base + 'b')).not.toThrow();
  });
});
