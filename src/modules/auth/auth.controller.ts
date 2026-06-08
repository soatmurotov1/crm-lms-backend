import { Body, Controller, Post, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Request } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private getClientIp(request: Request): string {
    return (
      (request.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      (request.headers['x-real-ip'] as string) ||
      request.socket.remoteAddress ||
      'Unknown'
    );
  }

  @Post('login')
  login(@Body() payload: LoginDto, @Req() request: Request) {
    const ipAddress = this.getClientIp(request);
    return this.authService.login(payload, ipAddress);
  }

  @Post('login/admin')
  loginAdmin(@Body() payload: LoginDto, @Req() request: Request) {
    const ipAddress = this.getClientIp(request);
    return this.authService.login(payload, ipAddress);
  }

  @Post('login/teacher')
  loginTeacher(@Body() payload: LoginDto, @Req() request: Request) {
    const ipAddress = this.getClientIp(request);
    return this.authService.loginTeacher(payload, ipAddress);
  }

  @Post('login/student')
  loginStudent(@Body() payload: LoginDto, @Req() request: Request) {
    const ipAddress = this.getClientIp(request);
    return this.authService.loginStudent(payload, ipAddress);
  }
}
