import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { assertProductionConfig, parseCorsOrigins } from './common/config';

async function bootstrap() {
  assertProductionConfig();
  // CORS_ORIGINS="https://app.ejemplo.com,https://caja.ejemplo.com"; sin definir solo se acepta en desarrollo (en producción la API no arranca)
  const origins = parseCorsOrigins(process.env.CORS_ORIGINS);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: origins.length ? { origin: origins } : true,
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.use(helmet()); // cabeceras de seguridad HTTP
  app.set('trust proxy', 1); // detrás del balanceador del hosting (HTTPS termina allí)
  // firmas y fotografías de entrega viajan como imágenes en base64
  app.useBodyParser('json', { limit: '10mb' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}
bootstrap();
