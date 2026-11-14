/**
 * La aplicación completa debe poder arrancar: las pruebas unitarias no detectan errores de inyección de dependencias
 * (por ejemplo, un servicio con un parámetro de constructor que Nest no sabe resolver), y eso tumbaría la API al desplegar.
 */
import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma.service';

describe('arranque de la aplicación', () => {
  it('todos los módulos y servicios se pueden construir', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    expect(app.get(PrismaService)).toBeDefined();
    await app.close();
  });
});
