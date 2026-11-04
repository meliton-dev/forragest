import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { DriverModule } from './driver/driver.module';
import { InventoryModule } from './inventory/inventory.module';

@Module({ imports: [AuthModule, InventoryModule, DriverModule] })
export class AppModule {}
