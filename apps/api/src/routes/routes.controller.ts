import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { RoadPathService } from './road-path';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Roles } from '../common/roles';
import { RoutesService } from './routes.service';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

class NewPointDto {
  @Transform(trim) @IsString() @IsNotEmpty({ message: 'Escribe el nombre del punto de entrega' }) @MaxLength(120) name: string;
  @Transform(trim) @IsString() @IsNotEmpty({ message: 'Escribe la dirección o una referencia' }) @MaxLength(200) address: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) contact?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(30) phone?: string;
  @IsNumber({}, { message: 'Marca el punto en el mapa' }) @Min(-90) @Max(90) lat: number;
  @IsNumber({}, { message: 'Marca el punto en el mapa' }) @Min(-180) @Max(180) lng: number;
}

class ItemDto {
  @IsInt() productId: number;
  @IsOptional() @IsInt() presentationId?: number;
  @IsNumber() @Min(0.001) quantity: number;
}

class StopDto {
  @IsInt() customerId: number;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'La hora estimada debe tener formato HH:MM' }) eta?: string;
  @IsOptional() @IsIn(['CONTADO', 'CREDITO']) paymentTerms?: 'CONTADO' | 'CREDITO';
  @IsOptional() @IsString() @MaxLength(300) instructions?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ItemDto) items: ItemDto[];
}

class CreateRouteDto {
  @IsString() @IsNotEmpty() @MaxLength(80) name: string;
  @IsDateString() date: string;
  @IsInt() driverId: number;
  @IsInt() vehicleId: number;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'La hora de salida debe tener formato HH:MM' }) plannedDeparture?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(40) @ValidateNested({ each: true }) @Type(() => StopDto) stops: StopDto[];
}

class PointDto {
  @IsNumber() @Min(-90) @Max(90) lat: number;
  @IsNumber() @Min(-180) @Max(180) lng: number;
}
class PathDto {
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(26) @ValidateNested({ each: true }) @Type(() => PointDto) points: PointDto[];
}

@Roles('SUPERVISOR_RUTAS')
@Controller('routes')
export class RoutesController {
  constructor(
    private routes: RoutesService,
    private roads: RoadPathService,
  ) {}

  @Get('options')
  options() {
    return this.routes.options();
  }

  /** Nuevo punto de entrega marcado en el mapa por quien arma la ruta. */
  @Post('points')
  createPoint(@Body() dto: NewPointDto) {
    return this.routes.createPoint(dto);
  }

  /** Ruta por calles pasando por los puntos en orden (vista previa al crear una ruta y mapa en vivo). */
  @Post('path')
  path(@Body() dto: PathDto) {
    return this.roads.path(dto.points);
  }

  @Get('live')
  live() {
    return this.routes.live();
  }

  @Get('monitor')
  monitor() {
    return this.routes.monitor();
  }

  @Get('efficiency')
  efficiency(@Query('from') from?: string, @Query('to') to?: string) {
    return this.routes.efficiency(from, to);
  }

  @Get()
  list(@Query('scope') scope?: 'today' | 'scheduled' | 'finished') {
    return this.routes.list(scope);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.routes.get(id);
  }

  @Post()
  create(@Body() dto: CreateRouteDto) {
    return this.routes.create(dto);
  }
}
