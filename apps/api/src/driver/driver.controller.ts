import { Body, Controller, Get, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Roles } from '../common/roles';
import { DriverService } from './driver.service';

const METHODS = ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA'] as const;
const IMG = 3_000_000; // ~2 MB de imagen en base64

class PaymentDto {
  @IsNumber() @Min(0) amount: number;
  @IsIn(METHODS) method: (typeof METHODS)[number];
}

class DeliverDto {
  @IsString() @IsNotEmpty() @MaxLength(64) clientOpId: string;
  @IsOptional() @IsDateString() deliveredAt?: string;
  @IsOptional() @IsString() @MaxLength(IMG) signature?: string;
  @IsOptional() @IsString() @MaxLength(IMG) photo?: string;
  @IsOptional() @ValidateNested() @Type(() => PaymentDto) payment?: PaymentDto;
}

class FailDto {
  @IsString() @IsNotEmpty() @MaxLength(64) clientOpId: string;
  @IsIn(['CLIENTE_AUSENTE', 'RECHAZO', 'DIRECCION_INCORRECTA', 'SIN_ACCESO', 'OTRO']) reason: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsOptional() @IsString() @MaxLength(IMG) photo?: string;
  @IsOptional() @IsDateString() at?: string;
}

class CreatePaymentDto {
  @IsString() @IsNotEmpty() @MaxLength(64) clientOpId: string;
  @IsInt() routeId: number;
  @IsOptional() @IsInt() stopId?: number;
  @IsOptional() @IsInt() customerId?: number;
  @IsNumber() @Min(0.01) amount: number;
  @IsIn(METHODS) method: (typeof METHODS)[number];
  @IsOptional() @IsDateString() receivedAt?: string;
}

class CreateIncidentDto {
  @IsString() @IsNotEmpty() @MaxLength(64) clientOpId: string;
  @IsInt() routeId: number;
  @IsOptional() @IsInt() stopId?: number;
  @IsIn(['CLIENTE_AUSENTE', 'PRODUCTO_DANADO', 'RETRASO', 'OTRO']) type: 'CLIENTE_AUSENTE' | 'PRODUCTO_DANADO' | 'RETRASO' | 'OTRO';
  @IsString() @IsNotEmpty() @MaxLength(500) description: string;
  @IsOptional() @IsString() @MaxLength(IMG) photo?: string;
  @IsOptional() @IsDateString() createdAt?: string;
}

class ArriveDto {
  @IsOptional() @IsDateString() at?: string;
}

class PingDto {
  @IsNumber() @Min(-90) @Max(90) lat: number;
  @IsNumber() @Min(-180) @Max(180) lng: number;
  @IsOptional() @IsNumber() @Min(0) accuracy?: number;
  @IsDateString() at: string;
}

class LocationsDto {
  @IsInt() routeId: number;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => PingDto) pings: PingDto[];
}

class CloseDto {
  @IsOptional() @IsDateString() returnedAt?: string;
}

@Roles('CHOFER')
@Controller('driver')
export class DriverController {
  constructor(private driver: DriverService) {}

  @Get('route')
  route(@Req() req: any) {
    return this.driver.currentRoute(req.user.sub);
  }

  @Post('routes/:id/start')
  start(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.driver.start(id, req.user.sub);
  }

  @Get('routes/:id/summary')
  summary(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.driver.summary(id, req.user.sub);
  }

  @Post('routes/:id/close')
  close(@Param('id', ParseIntPipe) id: number, @Body() dto: CloseDto, @Req() req: any) {
    return this.driver.close(id, req.user.sub, dto.returnedAt);
  }

  @Post('stops/:id/arrive')
  arrive(@Param('id', ParseIntPipe) id: number, @Body() dto: ArriveDto, @Req() req: any) {
    return this.driver.arrive(id, req.user.sub, dto.at);
  }

  @Post('locations')
  locations(@Body() dto: LocationsDto, @Req() req: any) {
    return this.driver.savePings(req.user.sub, dto.routeId, dto.pings);
  }

  @Post('stops/:id/deliver')
  deliver(@Param('id', ParseIntPipe) id: number, @Body() dto: DeliverDto, @Req() req: any) {
    return this.driver.deliver(id, req.user.sub, dto);
  }

  @Post('stops/:id/fail')
  fail(@Param('id', ParseIntPipe) id: number, @Body() dto: FailDto, @Req() req: any) {
    return this.driver.fail(id, req.user.sub, dto);
  }

  @Get('routes/:id/payments')
  payments(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.driver.payments(id, req.user.sub);
  }

  @Post('payments')
  createPayment(@Body() dto: CreatePaymentDto, @Req() req: any) {
    return this.driver.createPayment(req.user.sub, dto);
  }

  @Get('routes/:id/incidents')
  incidents(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.driver.incidents(id, req.user.sub);
  }

  @Post('incidents')
  createIncident(@Body() dto: CreateIncidentDto, @Req() req: any) {
    return this.driver.createIncident(req.user.sub, dto);
  }
}
