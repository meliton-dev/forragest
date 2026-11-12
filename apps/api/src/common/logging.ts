import { ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Params } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Registros en JSON (una línea por petición), listos para el visor de logs del hosting.
 * Cada petición lleva un id (cabecera X-Request-Id) para encontrar su rastro cuando un usuario reporta un error.
 */
export const loggerConfig: Params = {
  pinoHttp: {
    level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
    genReqId: (req: IncomingMessage, res: ServerResponse) => {
      const incoming = req.headers['x-request-id'];
      const id = typeof incoming === 'string' && /^[\w-]{1,64}$/.test(incoming) ? incoming : randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    // nunca escribir tokens ni contraseñas en los registros
    redact: ['req.headers.authorization', 'req.headers.cookie', 'req.body.password'],
    serializers: {
      req: (req: { id: string; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
    customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    customProps: (req) => ({ userId: (req as IncomingMessage & { user?: { sub?: number } }).user?.sub }),
    autoLogging: { ignore: (req) => req.url === '/health' },
  },
};

/**
 * Errores inesperados (no HttpException): se registran completos con su id de petición
 * y al usuario solo se le muestra un mensaje genérico con ese id para reportarlo.
 */
@Catch()
export class UnexpectedErrorFilter extends BaseExceptionFilter {
  private readonly logger = new Logger('Error');

  catch(exception: unknown, host: ArgumentsHost) {
    // los errores esperados (400, 401, 404...) responden igual que siempre
    if (exception instanceof HttpException || host.getType() !== 'http') return super.catch(exception, host);
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();
    const requestId = String(req.id ?? '');
    this.logger.error({ err: exception, requestId, method: req.method, url: req.url }, 'Error no controlado');
    res.status(500).json({ statusCode: 500, message: `Ocurrió un error en el servidor. Código de referencia: ${requestId.slice(0, 8)}`, requestId });
  }
}
