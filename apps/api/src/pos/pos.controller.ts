import type { AuthedRequest } from '../auth/jwt-auth.guard';
import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { Roles } from '../common/roles';
import { PosService } from './pos.service';

class AuthorizationDto {
  @IsString() @MaxLength(64) username: string;
  @IsString() @MaxLength(128) password: string;
}

class LineDto {
  @IsInt() productId: number;
  @IsOptional() @IsInt() presentationId?: number;
  @IsNumber() @Min(0.001) quantity: number;
}

class CreateSaleDto {
  @IsOptional() @IsString() @MaxLength(64) clientOpId?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => LineDto) items: LineDto[];
  @IsOptional() @IsInt() customerId?: number;
  @IsIn(['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'CREDITO']) paymentMethod: 'EFECTIVO' | 'TRANSFERENCIA' | 'TARJETA' | 'CREDITO';
  @IsOptional() @IsNumber() @Min(0) received?: number;
  @IsOptional() @IsNumber() @Min(0) discountPercent?: number;
  @IsOptional() @IsNumber() @Min(0) discountAmount?: number;
  @IsOptional() @ValidateNested() @Type(() => AuthorizationDto) authorization?: AuthorizationDto;
}

class CancelDto {
  @IsString() @IsNotEmpty() @MaxLength(300) reason: string;
  @ValidateNested() @Type(() => AuthorizationDto) authorization: AuthorizationDto;
}

class ReturnItemDto {
  @IsInt() saleItemId: number;
  @IsNumber() @Min(0) quantity: number;
}
class ReturnDto {
  @IsInt() saleId: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ReturnItemDto) items: ReturnItemDto[];
  @IsString() @IsNotEmpty() @MaxLength(200) reason: string;
  @IsOptional() @IsString() @MaxLength(300) comments?: string;
  @IsOptional() @IsIn(['EFECTIVO', 'TARJETA', 'SALDO_A_FAVOR']) refundMethod?: 'EFECTIVO' | 'TARJETA' | 'SALDO_A_FAVOR';
}

class OpenShiftDto {
  @IsNumber() @Min(0) openingFloat: number;
}
class CloseShiftDto {
  @IsNumber() @Min(0) countedCash: number;
  @IsOptional() @IsString() @MaxLength(300) notes?: string;
  @IsOptional() @IsObject() denominations?: Record<string, number>;
}

@Roles('CAJERO')
@Controller('pos')
export class PosController {
  constructor(private pos: PosService) {}

  @Get('catalog')
  catalog(@Query('q') q?: string, @Query('line') line?: string) {
    return this.pos.catalog(q, line);
  }

  @Get('customers')
  customers(@Query('q') q?: string) {
    return this.pos.customers(q);
  }

  @Get('customers/:id/credit')
  credit(@Param('id', ParseIntPipe) id: number) {
    return this.pos.creditOf(id);
  }

  @Get('shift')
  shift(@Req() req: AuthedRequest) {
    return this.pos.currentShift(req.user.sub);
  }

  @Post('shift/open')
  open(@Body() dto: OpenShiftDto, @Req() req: AuthedRequest) {
    return this.pos.openShift(req.user.sub, dto.openingFloat);
  }

  @Post('shift/close')
  close(@Body() dto: CloseShiftDto, @Req() req: AuthedRequest) {
    return this.pos.closeShift(req.user.sub, dto);
  }

  @Post('sales')
  create(@Body() dto: CreateSaleDto, @Req() req: AuthedRequest) {
    return this.pos.createSale(req.user.sub, dto);
  }

  @Get('sales')
  list(@Query('q') q?: string, @Query('status') status?: string) {
    return this.pos.listSales(q, status);
  }

  @Post('authorize')
  authorize(@Body() dto: AuthorizationDto, @Req() req: AuthedRequest) {
    return this.pos.verifyAuthorization(req.user.sub, dto);
  }

  @Get('sales/by-folio/:folio')
  byFolio(@Param('folio', ParseIntPipe) folio: number) {
    return this.pos.saleByFolio(folio);
  }

  @Get('sales/:id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.pos.getSale(id);
  }

  @Post('sales/:id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number, @Body() dto: CancelDto, @Req() req: AuthedRequest) {
    return this.pos.cancelSale(req.user.sub, id, dto);
  }

  @Post('returns')
  createReturn(@Body() dto: ReturnDto, @Req() req: AuthedRequest) {
    return this.pos.createReturn(req.user.sub, dto);
  }
}
