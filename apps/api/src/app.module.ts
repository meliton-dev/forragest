import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { DriverModule } from './driver/driver.module';
import { InventoryModule } from './inventory/inventory.module';
import { PosModule } from './pos/pos.module';

@Module({ imports: [AuthModule, InventoryModule, DriverModule, PosModule] })
export class AppModule {}
