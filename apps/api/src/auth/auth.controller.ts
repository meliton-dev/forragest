import { Body, Controller, Get, Ip, Post, Req } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { AuthService } from './auth.service';
import { AuthedRequest, Public } from './jwt-auth.guard';

class LoginDto {
  @IsString() @MaxLength(64) username: string;
  @IsString() @MaxLength(128) password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.auth.login(dto.username, dto.password, ip);
  }

  @Get('me')
  me(@Req() req: AuthedRequest) {
    return req.user;
  }
}
