import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { DriverController } from './driver.controller';
import { DriverService } from './driver.service';

@Module({ imports: [InventoryModule], controllers: [DriverController], providers: [DriverService] })
export class DriverModule {}
