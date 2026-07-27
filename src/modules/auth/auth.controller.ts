import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { Request } from 'express';
import { LoginThrottleGuard } from 'src/common/guard/login-throttle.guard';
import { AuthGuard } from 'src/common/guard/jwt-auth.guard';
import { getClientIp } from 'src/common/utils/client-ip.util';
import { VerificationService } from './verification.service';
import { SendCodeDto } from './dto/send-code.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import {
  ConfirmPhoneChangeDto,
  RequestPhoneChangeDto,
} from './dto/change-phone.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { Role, VerificationPurpose } from '@prisma/client';

interface AuthedRequest extends Request {
  user: { id: number; role: Role; phone: string; fullName: string };
}

@Controller('auth')
@UseGuards(LoginThrottleGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly verificationService: VerificationService,
  ) {}

  @Post('register')
  @ApiOperation({
    summary: "Ochiq ro'yxatdan o'tish - yangi hisob STUDENT bo'lib ochiladi",
  })
  register(@Body() payload: RegisterDto, @Req() request: Request) {
    return this.authService.register(payload, getClientIp(request));
  }

  @Post('send-code')
  @ApiOperation({ summary: 'Telefon raqamiga tasdiqlash kodi (SMS) yuborish' })
  sendCode(@Body() payload: SendCodeDto) {
    return this.verificationService.sendCode(
      payload.phone,
      payload.purpose ?? VerificationPurpose.REGISTER,
    );
  }

  @Post('verify-code')
  @ApiOperation({ summary: 'SMS kodni tasdiqlash' })
  verifyCode(@Body() payload: VerifyCodeDto) {
    return this.verificationService.verifyCode(
      payload.phone,
      payload.code,
      payload.purpose ?? VerificationPurpose.REGISTER,
    );
  }

  @Post('set-password')
  @ApiOperation({
    summary: "SMS kod tasdiqlangandan keyin foydalanuvchi o'z parolini qo'yadi",
  })
  setPassword(@Body() payload: SetPasswordDto) {
    return this.authService.setPassword(
      payload.phone,
      payload.code,
      payload.password,
      VerificationPurpose.REGISTER,
    );
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Parolni tiklash uchun SMS kod so\'rash' })
  forgotPassword(@Body() payload: ForgotPasswordDto) {
    return this.authService.forgotPassword(payload.phone);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'SMS kod bilan yangi parol o\'rnatish' })
  resetPassword(@Body() payload: SetPasswordDto) {
    return this.authService.setPassword(
      payload.phone,
      payload.code,
      payload.password,
      VerificationPurpose.RESET_PASSWORD,
    );
  }

  @Post('change-phone/send-code')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Yangi telefon raqamiga tasdiqlash kodi yuborish' })
  requestPhoneChange(@Body() payload: RequestPhoneChangeDto) {
    return this.authService.requestPhoneChange(payload.newPhone);
  }

  @Post('change-phone/confirm')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Telefon raqamini o'zgartirishni tasdiqlash" })
  confirmPhoneChange(
    @Body() payload: ConfirmPhoneChangeDto,
    @Req() request: AuthedRequest,
  ) {
    return this.authService.confirmPhoneChange(
      request.user,
      payload.newPhone,
      payload.code,
    );
  }

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
