import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

/** En producción no se arranca con un secreto ausente o débil: cualquiera podría falsificar sesiones. */
function assertProductionConfig() {
  if (process.env.NODE_ENV !== 'production') return;
  const secret = process.env.JWT_SECRET ?? '';
  if (secret.length < 24 || /cambia|secret|changeme/i.test(secret)) {
    throw new Error('JWT_SECRET debe definirse con al menos 24 caracteres aleatorios en producción.');
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL no está definida.');
}

async function bootstrap() {
  assertProductionConfig();
  // CORS_ORIGINS="https://app.ejemplo.com,https://caja.ejemplo.com"; sin definir (desarrollo) acepta cualquier origen
  const origins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: origins.length ? { origin: origins } : true });
  app.use(helmet()); // cabeceras de seguridad HTTP
  app.set('trust proxy', 1); // detrás del balanceador del hosting (HTTPS termina allí)
  // firmas y fotografías de entrega viajan como imágenes en base64
  app.useBodyParser('json', { limit: '10mb' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}
bootstrap();
