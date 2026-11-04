import { Controller, Get } from '@nestjs/common';
import { hostname } from 'node:os';
import { Public } from './auth/jwt-auth.guard';
import { PrismaService } from './prisma.service';

const startedAt = Date.now();

/** Estado público del servicio: lo usan el hosting (health check) y el reporte de consumo remoto. */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    let db: 'up' | 'down' = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'down';
    }
    return {
      status: db === 'up' ? 'ok' : 'degraded',
      service: 'forragest-api',
      environment: process.env.NODE_ENV ?? 'development',
      db,
      host: hostname(),
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      serverTime: new Date().toISOString(),
    };
  }
}
