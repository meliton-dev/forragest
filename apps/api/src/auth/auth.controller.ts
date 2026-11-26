import { Body, Controller, Get, Ip, Post, Req } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { AuthService } from './auth.service';
import { AllowDuringPasswordChange, AuthedRequest, Public } from './jwt-auth.guard';

class LoginDto {
  @IsString() @MaxLength(64) username: string;
  @IsString() @MaxLength(128) password: string;
}

class ChangePasswordDto {
  @IsString() @MaxLength(128) currentPassword: string;
  @IsString() @MaxLength(128) newPassword: string;
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.auth.login(dto.username, dto.password, ip);
  }

  @AllowDuringPasswordChange()
  @Get('me')
  me(@Req() req: AuthedRequest) {
    return this.auth.me(req.user.sub);
  }

  @AllowDuringPasswordChange()
  @Post('change-password')
  changePassword(@Body() dto: ChangePasswordDto, @Req() req: AuthedRequest) {
    return this.auth.changePassword(req.user.sub, dto.currentPassword, dto.newPassword);
  }
}
