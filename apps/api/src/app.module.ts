import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { loggerConfig, UnexpectedErrorFilter } from './common/logging';
import { AuthModule } from './auth/auth.module';
import { DriverModule } from './driver/driver.module';
import { HealthController } from './health.controller';
import { InventoryModule } from './inventory/inventory.module';
import { PosModule } from './pos/pos.module';
import { PrismaService } from './prisma.service';
import { PurchasingModule } from './purchasing/purchasing.module';
import { RoutesModule } from './routes/routes.module';

@Module({
  imports: [LoggerModule.forRoot(loggerConfig), AuthModule, InventoryModule, DriverModule, PosModule, RoutesModule, PurchasingModule],
  controllers: [HealthController],
  providers: [PrismaService, { provide: APP_FILTER, useClass: UnexpectedErrorFilter }],
})
export class AppModule {}
