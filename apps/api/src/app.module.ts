import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { DriverModule } from './driver/driver.module';
import { HealthController } from './health.controller';
import { InventoryModule } from './inventory/inventory.module';
import { PosModule } from './pos/pos.module';
import { PrismaService } from './prisma.service';
import { RoutesModule } from './routes/routes.module';

@Module({
  imports: [AuthModule, InventoryModule, DriverModule, PosModule, RoutesModule],
  controllers: [HealthController],
  providers: [PrismaService],
})
export class AppModule {}
