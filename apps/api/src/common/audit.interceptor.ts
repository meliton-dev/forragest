import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../prisma.service';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

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
          .create({ data: { userId: req.user?.sub ?? null, action: req.method, entity: req.path, payload: body } })
          .catch(() => undefined);
      }),
    );
  }
}
