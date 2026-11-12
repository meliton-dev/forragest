import type { AuthedRequest } from '../auth/jwt-auth.guard';
import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';
import { Roles } from '../common/roles';
import { CountsService } from './counts.service';
import { InventoryService } from './inventory.service';
import { ProductsService } from './products.service';

class CreateProductDto {
  @IsString() @IsNotEmpty() code: string;
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() description?: string;
  @IsString() lineCode: string;
  @IsString() unit: string;
  @IsNumber() @Min(0) purchasePrice: number;
  @IsNumber() @Min(0) salePrice: number;
  @IsOptional() @IsNumber() @Min(0) minStock?: number;
}

class UpdateProductDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsNumber() @Min(0) purchasePrice?: number;
  @IsOptional() @IsNumber() @Min(0) salePrice?: number;
  @IsOptional() @IsNumber() @Min(0) minStock?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

class PresentationDto {
  @IsString() @IsNotEmpty() name: string;
  @IsNumber() @IsPositive() factor: number;
  @IsOptional() @IsNumber() @Min(0) salePrice?: number;
}

class EntryDto {
  @IsNumber() productId: number;
  @IsNumber() @IsPositive() quantity: number;
  @IsNumber() @Min(0) unitCost: number;
  @IsOptional() @Type(() => Date) @IsDate() expiresAt?: Date;
  @IsString() @IsNotEmpty() reason: string;
}

class AdjustDto {
  @IsNumber() productId: number;
  @IsNumber() delta: number;
  @IsString() @IsNotEmpty() reason: string;
}

class OpenCountDto {
  @IsOptional() @IsString() lineCode?: string;
}

class RecordCountDto {
  @IsNumber() productId: number;
  @IsNumber() @Min(0) countedQty: number;
}

class CloseCountDto {
  @IsOptional() @IsBoolean() apply?: boolean;
}

@Controller('products')
export class ProductsController {
  constructor(private products: ProductsService) {}

  @Get()
  search(@Query('q') q?: string, @Query('line') line?: string) {
    return this.products.search(q, line);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.products.get(id);
  }

  @Roles('GERENTE_COMPRAS', 'ALMACENISTA')
  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Roles('GERENTE_COMPRAS', 'ALMACENISTA')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto);
  }

  @Roles('GERENTE_COMPRAS', 'ALMACENISTA')
  @Post(':id/presentations')
  addPresentation(@Param('id', ParseIntPipe) id: number, @Body() dto: PresentationDto) {
    return this.products.addPresentation(id, dto);
  }
}

@Controller('inventory')
export class InventoryController {
  constructor(
    private inventory: InventoryService,
    private counts: CountsService,
  ) {}

  @Get()
  current(@Query('line') line?: string) {
    return this.inventory.current(line);
  }

  @Get('alerts')
  alerts() {
    return this.inventory.alerts();
  }

  @Get('movements')
  movements(@Query('productId') productId?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.inventory.movements({
      productId: productId ? Number(productId) : undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  @Roles('GERENTE_COMPRAS')
  @Get('reports/rotation')
  rotation(@Query('from') from?: string, @Query('to') to?: string) {
    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : new Date(end.getTime() - 30 * 86400000);
    return this.inventory.rotation(start, end);
  }

  /** Entrada manual autorizada; las entradas por orden de compra llegan en la fase de Compras. */
  @Roles('ALMACENISTA')
  @Post('entries')
  entry(@Body() dto: EntryDto, @Req() req: AuthedRequest) {
    return this.inventory.addEntry({
      productId: dto.productId,
      quantity: dto.quantity,
      unitCost: dto.unitCost,
      expiresAt: dto.expiresAt,
      type: 'ENTRADA_AJUSTE',
      reason: dto.reason,
      userId: req.user.sub,
    });
  }

  @Roles('ALMACENISTA')
  @Post('adjustments')
  adjust(@Body() dto: AdjustDto, @Req() req: AuthedRequest) {
    return this.inventory.adjust(dto.productId, dto.delta, dto.reason, req.user.sub);
  }

  @Roles('ALMACENISTA')
  @Post('counts')
  openCount(@Body() dto: OpenCountDto, @Req() req: AuthedRequest) {
    return this.counts.open(req.user.sub, dto.lineCode);
  }

  @Roles('ALMACENISTA')
  @Post('counts/:id/items')
  record(@Param('id', ParseIntPipe) id: number, @Body() dto: RecordCountDto) {
    return this.counts.record(id, dto.productId, dto.countedQty);
  }

  @Roles('ALMACENISTA')
  @Get('counts/:id/report')
  report(@Param('id', ParseIntPipe) id: number) {
    return this.counts.report(id);
  }

  @Roles('ALMACENISTA')
  @Post('counts/:id/close')
  close(@Param('id', ParseIntPipe) id: number, @Body() dto: CloseCountDto, @Req() req: AuthedRequest) {
    return this.counts.close(id, req.user.sub, !!dto.apply);
  }
}
