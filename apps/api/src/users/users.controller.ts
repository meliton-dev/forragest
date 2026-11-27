import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { AuthedRequest } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles';
import { UsersService } from './users.service';

const lower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateUserDto {
  @Transform(lower)
  @IsString()
  @MinLength(3, { message: 'El usuario debe tener entre 3 y 32 caracteres.' })
  @MaxLength(32, { message: 'El usuario debe tener entre 3 y 32 caracteres.' })
  @Matches(/^[a-z0-9._-]+$/, { message: 'El usuario solo puede llevar letras minúsculas, números, punto, guion y guion bajo.' })
  username: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(120) fullName: string;
  @IsEnum(Role, { message: 'El rol no es válido.' }) role: Role;
  @IsString() @MaxLength(128) password: string;
  @IsOptional() @IsBoolean() mustChangePassword?: boolean;
}

export class UpdateUserDto {
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(120) fullName?: string;
  @IsOptional() @IsEnum(Role, { message: 'El rol no es válido.' }) role?: Role;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class SetPasswordDto {
  @IsString() @MaxLength(128) password: string;
  @IsOptional() @IsBoolean() mustChangePassword?: boolean;
}

/** Administración de usuarios: solo ADMINISTRADOR. */
@Roles(Role.ADMINISTRADOR)
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto, @Req() req: AuthedRequest) {
    return this.users.update(id, dto, req.user.sub);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: AuthedRequest) {
    return this.users.remove(id, req.user.sub);
  }

  @Post(':id/password')
  setPassword(@Param('id', ParseIntPipe) id: number, @Body() dto: SetPasswordDto, @Req() req: AuthedRequest) {
    return this.users.setPassword(id, dto, req.user.sub);
  }
}
