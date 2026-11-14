import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

/** Días que se conservan las ubicaciones del camión (el recorrido de rutas viejas rara vez se consulta). */
export const DEFAULT_RETENTION_DAYS = 45;

/** Borra las ubicaciones anteriores al límite; devuelve cuántas eliminó. */
export async function purgeOldPings(prisma: Pick<PrismaService, 'locationPing'>, days = DEFAULT_RETENTION_DAYS, now = new Date()) {
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  const res = await prisma.locationPing.deleteMany({ where: { recordedAt: { lt: cutoff } } });
  return res.count;
}

/** Limpia las ubicaciones viejas al arrancar y una vez al día, para que la base gratuita no se llene. */
@Injectable()
export class PingRetention implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PingRetention.name);
  private timer?: NodeJS.Timeout;
  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    const days = Number(process.env.PING_RETENTION_DAYS) || DEFAULT_RETENTION_DAYS;
    const run = () =>
      purgeOldPings(this.prisma, days)
        .then((n) => n && this.log.log(`Ubicaciones antiguas eliminadas: ${n}`))
        .catch((e) => this.log.warn(`No se pudo limpiar ubicaciones: ${e instanceof Error ? e.message : e}`));
    void run();
    this.timer = setInterval(run, 86_400_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
