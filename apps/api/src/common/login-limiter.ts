import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

/**
 * Frena a quien prueba contraseñas: tras 5 intentos fallidos con la misma llave
 * (usuario + IP en el login, usuario en la autorización de supervisor) responde 429 durante 15 minutos.
 * Vive en memoria: sirve para un solo servidor; con varias instancias habría que moverlo a Redis.
 */
@Injectable()
export class LoginLimiter {
  private failures = new Map<string, { count: number; resetAt: number }>();

  /** Lanza 429 si la llave está bloqueada. Llamar antes de verificar la contraseña. */
  check(key: string, now = Date.now()) {
    const f = this.failures.get(key);
    if (!f) return;
    if (f.resetAt <= now) {
      this.failures.delete(key);
      return;
    }
    if (f.count >= MAX_FAILURES) {
      const minutes = Math.ceil((f.resetAt - now) / 60000);
      throw new HttpException(`Demasiados intentos fallidos. Intenta de nuevo en ${minutes} min.`, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  fail(key: string, now = Date.now()) {
    const f = this.failures.get(key);
    if (!f || f.resetAt <= now) this.failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
    else f.count++;
    if (this.failures.size > 10_000) this.prune(now);
  }

  succeed(key: string) {
    this.failures.delete(key);
  }

  private prune(now: number) {
    for (const [k, f] of this.failures) if (f.resetAt <= now) this.failures.delete(k);
  }
}
