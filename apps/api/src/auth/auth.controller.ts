import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { IsString } from 'class-validator';
import { AuthService } from './auth.service';
import { Public } from './jwt-auth.guard';

class LoginDto {
  @IsString() username: string;
  @IsString() password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.username, dto.password);
  }

  @Get('me')
  me(@Req() req: any) {
    return req.user;
  }
}
