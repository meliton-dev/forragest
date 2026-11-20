import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'http';

// express llega con @nestjs/platform-express (no trae tipos y no es una dependencia directa nueva)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { json, urlencoded } = require('express') as {
  json: (o: { limit: string }) => Middleware;
  urlencoded: (o: { extended: boolean; limit: string }) => Middleware;
};

type Req = IncomingMessage & { path: string };
type Middleware = (req: Req, res: ServerResponse, next: (err?: unknown) => void) => void;

/** Tope normal del cuerpo de una petición. */
export const DEFAULT_BODY_LIMIT = '200kb';
/** Tope para las rutas del chofer que llevan firma o foto en base64 (hasta ~3 MB cada una). */
export const IMAGE_BODY_LIMIT = '10mb';

/** Rutas que reciben imágenes: entrega, no entrega e incidencias del chofer. */
const IMAGE_ROUTES = /^\/driver\/(stops\/\d+\/(deliver|fail)|incidents)\/?$/;

export const isImageRoute = (path: string) => IMAGE_ROUTES.test(path);

/** Lee el JSON con el tope que le toca a la ruta; solo las rutas con imágenes aceptan 10 MB. */
export function bodyParsers(): Middleware {
  const small = json({ limit: DEFAULT_BODY_LIMIT });
  const big = json({ limit: IMAGE_BODY_LIMIT });
  const form = urlencoded({ extended: true, limit: DEFAULT_BODY_LIMIT });
  // Los errores del lector (cuerpo muy grande, JSON mal formado) llegan con su código HTTP: se pasan como
  // HttpException para que respondan 413/400 y no caigan como "error inesperado" (500) en el filtro global.
  const toHttp = (err: unknown) => {
    const e = err as { status?: number; type?: string };
    if (e?.status === 413) return new PayloadTooLargeException('La información enviada es demasiado grande.');
    if (e?.status && e.status >= 400 && e.status < 500) return new BadRequestException('La información enviada no es válida.');
    return err;
  };
  return (req, res, next) =>
    (isImageRoute(req.path) ? big : small)(req, res, (err) => (err ? next(toHttp(err)) : form(req, res, (err2) => next(err2 ? toHttp(err2) : undefined))));
}
