import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Request } from 'express';
import { LoginThrottleGuard } from 'src/common/guard/login-throttle.guard';
import { getClientIp } from 'src/common/utils/client-ip.util';

@Controller('auth')
@UseGuards(LoginThrottleGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() payload: LoginDto, @Req() request: Request) {
    return this.authService.login(payload, getClientIp(request));
  }

  @Post('login/admin')
  loginAdmin(@Body() payload: LoginDto, @Req() request: Request) {
    return this.authService.login(payload, getClientIp(request));
  }

  @Post('login/teacher')
  loginTeacher(@Body() payload: LoginDto, @Req() request: Request) {
    return this.authService.loginTeacher(payload, getClientIp(request));
  }

  @Post('login/student')
  loginStudent(@Body() payload: LoginDto, @Req() request: Request) {
    return this.authService.loginStudent(payload, getClientIp(request));
  }
}
