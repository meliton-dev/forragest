import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../prisma.service';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Evita guardar imágenes en base64 (firmas, fotos) dentro de la bitácora. */
function shorten(value: any): any {
  if (typeof value === 'string') return value.length > 200 ? `${value.slice(0, 40)}… (${value.length} caracteres)` : value;
  if (Array.isArray(value)) return value.map(shorten);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shorten(v)]));
  return value;
}

/** Bitácora de auditoría: registra toda operación que modifica datos (ventas, cancelaciones, ajustes). */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    if (!MUTATING.has(req.method) || req.path === '/auth/login') return next.handle();
    return next.handle().pipe(
      tap(() => {
        const { password, ...body } = req.body ?? {};
        this.prisma.auditLog
          .create({ data: { userId: req.user?.sub ?? null, action: req.method, entity: req.path, payload: shorten(body) } })
          .catch(() => undefined);
      }),
    );
  }
}
