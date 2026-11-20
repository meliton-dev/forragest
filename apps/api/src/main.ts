import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { bodyParsers } from './common/body-limit';
import { assertProductionConfig, parseCorsOrigins } from './common/config';

async function bootstrap() {
  assertProductionConfig();
  // CORS_ORIGINS="https://app.ejemplo.com,https://caja.ejemplo.com"; sin definir solo se acepta en desarrollo (en producción la API no arranca)
  const origins = parseCorsOrigins(process.env.CORS_ORIGINS);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: origins.length ? { origin: origins } : true,
    bufferLogs: true,
    bodyParser: false, // los lectores de JSON se registran abajo, con tope distinto por ruta
  });
  app.useLogger(app.get(Logger));
  app.use(helmet()); // cabeceras de seguridad HTTP
  app.set('trust proxy', 1); // detrás del balanceador del hosting (HTTPS termina allí)
  // 200 KB para todo; 10 MB solo en las rutas del chofer con firma o foto en base64 (ver common/body-limit.ts)
  app.use(bodyParsers());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}
bootstrap();
