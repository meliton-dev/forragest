import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req } from '@nestjs/common';
import { PurchaseStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Roles } from '../common/roles';
import { PurchasingService } from './purchasing.service';

class SupplierDto {
  @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @IsOptional() @Matches(/^([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})?$/i, { message: 'El RFC no tiene un formato válido' }) rfc?: string;
  @IsOptional() @IsString() @MaxLength(120) contact?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @Matches(/^$|^\S+@\S+\.\S+$/, { message: 'El correo no es válido' }) email?: string;
  @IsOptional() @IsString() @MaxLength(250) address?: string;
  @IsOptional() @IsInt() @Min(0) paymentDays?: number;
  @IsOptional() @IsArray() @IsInt({ each: true }) lineIds?: number[];
  @IsOptional() @IsBoolean() active?: boolean;
}

class OrderItemDto {
  @IsInt() productId: number;
  @IsNumber() @Min(0.001) quantity: number;
  @IsNumber() @Min(0) unitCost: number;
}

class CreateOrderDto {
  @IsInt() supplierId: number;
  @IsOptional() @IsDateString() expectedAt?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => OrderItemDto) items: OrderItemDto[];
}

class ReceiveItemDto {
  @IsInt() orderItemId: number;
  @IsNumber() @Min(0) quantity: number;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

class ReceiveDto {
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  /** cerrar la orden aunque falte mercancía (queda registrado el faltante) */
  @IsOptional() @IsBoolean() closeShort?: boolean;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ReceiveItemDto) items: ReceiveItemDto[];
}

class PayDto {
  @IsNumber() @Min(0.01) amount: number;
}

const STATUSES: PurchaseStatus[] = ['BORRADOR', 'ENVIADA', 'PARCIAL', 'RECIBIDA', 'CANCELADA'];
const optInt = (v: string | undefined, name: string) => {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new BadRequestException(`${name} no es válido`);
  return n;
};

@Roles('GERENTE_COMPRAS')
@Controller('purchasing')
export class PurchasingController {
  constructor(private purchasing: PurchasingService) {}

  @Get('options')
  options() {
    return this.purchasing.options();
  }

  @Get('alerts')
  alerts() {
    return this.purchasing.alerts();
  }

  @Get('suggestions')
  suggestions() {
    return this.purchasing.suggestions();
  }

  @Get('price-history')
  priceHistory(@Query('productId') productId?: string, @Query('supplierId') supplierId?: string) {
    return this.purchasing.priceHistory({ productId: optInt(productId, 'El producto'), supplierId: optInt(supplierId, 'El proveedor') });
  }

  @Get('suppliers')
  suppliers() {
    return this.purchasing.listSuppliers();
  }

  @Post('suppliers')
  createSupplier(@Body() dto: SupplierDto) {
    return this.purchasing.createSupplier(dto);
  }

  @Post('suppliers/:id')
  updateSupplier(@Param('id', ParseIntPipe) id: number, @Body() dto: SupplierDto) {
    return this.purchasing.updateSupplier(id, dto);
  }

  @Get('orders')
  orders(@Query('status') status?: string, @Query('supplierId') supplierId?: string) {
    if (status && !STATUSES.includes(status as PurchaseStatus)) throw new BadRequestException('Estado no válido');
    return this.purchasing.listOrders({ status: status as PurchaseStatus | undefined, supplierId: optInt(supplierId, 'El proveedor') });
  }

  @Get('orders/:id')
  order(@Param('id', ParseIntPipe) id: number) {
    return this.purchasing.getOrder(id);
  }

  @Post('orders')
  createOrder(@Body() dto: CreateOrderDto, @Req() req: any) {
    return this.purchasing.createOrder(dto, req.user.sub);
  }

  @Post('orders/:id/send')
  send(@Param('id', ParseIntPipe) id: number) {
    return this.purchasing.send(id);
  }

  @Post('orders/:id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number) {
    return this.purchasing.cancel(id);
  }

  @Post('orders/:id/receive')
  receive(@Param('id', ParseIntPipe) id: number, @Body() dto: ReceiveDto, @Req() req: any) {
    return this.purchasing.receive(id, dto, req.user.sub);
  }

  @Get('payables')
  payables(@Query('status') status?: string, @Query('supplierId') supplierId?: string) {
    return this.purchasing.payables({ status, supplierId: optInt(supplierId, 'El proveedor') });
  }

  @Post('payables/:id/pay')
  pay(@Param('id', ParseIntPipe) id: number, @Body() dto: PayDto) {
    return this.purchasing.pay(id, dto.amount);
  }
}
