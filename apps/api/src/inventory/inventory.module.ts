import { Module } from '@nestjs/common';
import { CountsService } from './counts.service';
import { InventoryController, ProductsController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { ProductsService } from './products.service';

@Module({
  controllers: [ProductsController, InventoryController],
  providers: [InventoryService, ProductsService, CountsService],
  exports: [InventoryService],
})
export class InventoryModule {}
