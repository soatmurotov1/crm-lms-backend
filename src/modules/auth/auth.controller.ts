import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import type { Request } from 'express';
import {
  LoginThrottleGuard,
  SkipLoginThrottle,
} from 'src/common/guard/login-throttle.guard';
import { AuthGuard } from 'src/common/guard/jwt-auth.guard';
import { getClientIp } from 'src/common/utils/client-ip.util';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { LoginAttemptsQueryDto } from './dto/login-attempts-query.dto';
import { RolesGuard } from 'src/common/guard/roles.guard';
import { Roles } from 'src/common/guard/decarator.roles';
import {
  CurrentUser,
  type RequestUser,
} from 'src/common/guard/current-user.decorator';
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
  user: {
    id: number;
    role: Role;
    phone: string;
    fullName: string;
    sid: string;
  };
}

/** Log va sessiya uchun so'rov konteksti. */
function requestContext(request: Request) {
  return {
    ipAddress: getClientIp(request),
    userAgent: request.headers['user-agent'],
  };
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
    return this.authService.register(payload, requestContext(request));
  }

  @Post('send-code')
  @ApiOperation({
    summary: 'Telefon raqamiga tasdiqlash kodi (SMS) yuborish',
    description:
      "Raqam bazadan tekshiriladi: RESET_PASSWORD uchun hisob mavjud bo'lishi, " +
      "REGISTER va CHANGE_PHONE uchun esa raqam bo'sh bo'lishi shart.",
  })
  sendCode(@Body() payload: SendCodeDto) {
    return this.authService.sendVerificationCode(
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
  @ApiOperation({ summary: "Parolni tiklash uchun SMS kod so'rash" })
  forgotPassword(@Body() payload: ForgotPasswordDto) {
    return this.authService.forgotPassword(payload.phone);
  }

  @Post('reset-password')
  @ApiOperation({ summary: "SMS kod bilan yangi parol o'rnatish" })
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
    return this.authService.login(payload, requestContext(request));
  }

  @Post('login/admin')
  loginAdmin(@Body() payload: LoginDto, @Req() request: Request) {
    return this.authService.login(payload, requestContext(request));
  }

  @Post('login/teacher')
  loginTeacher(@Body() payload: LoginDto, @Req() request: Request) {
    return this.authService.loginTeacher(payload, requestContext(request));
  }

  @Post('login/student')
  loginStudent(@Body() payload: LoginDto, @Req() request: Request) {
    return this.authService.loginStudent(payload, requestContext(request));
  }

  /**
   * Access token muddati tuganda mijoz shu yerga keladi va yangisini oladi.
   *
   * `LoginThrottleGuard` dan chiqarilgan: bu parol tekshiradigan endpoint
   * emas, o'quv markazining hamma qurilmasi esa bitta IP dan chiqadi.
   */
  @Post('refresh')
  @SkipLoginThrottle()
  @ApiOperation({ summary: 'Refresh token orqali yangi access token olish' })
  refresh(@Body() payload: RefreshTokenDto, @Req() request: Request) {
    return this.authService.refresh(
      payload.refreshToken,
      requestContext(request),
    );
  }

  /**
   * Chiqish. Guard qo'yilmagan: token muddati tugagan bo'lsa ham chiqish
   * ishlashi kerak — bunday holatda sessiya refresh token bo'yicha yopiladi.
   */
  @Post('logout')
  @SkipLoginThrottle()
  @ApiOperation({ summary: 'Chiqish — sessiya serverda yopiladi' })
  logout(@Body() payload: LogoutDto, @Req() request: Request) {
    return this.authService.logout(
      this.sessionIdFromHeader(request),
      payload?.refreshToken,
    );
  }

  /**
   * Kirish urinishlari tarixi. Muvaffaqiyatsizlari ham yoziladi, ya'ni
   * "shu raqamga kim urinib ko'rdi" degan savolga javob beradi.
   */
  @Get('login-attempts')
  @SkipLoginThrottle()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN, Role.ADMIN, Role.MANAGEMENT, Role.ADMINSTRATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Kirish urinishlari jurnali (xavfsizlik)' })
  loginAttempts(
    @CurrentUser() user: RequestUser,
    @Query() query: LoginAttemptsQueryDto,
  ) {
    return this.authService.loginAttempts(user, query);
  }

  @Post('logout-all')
  @SkipLoginThrottle()
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Hamma qurilmadan chiqish' })
  logoutAll(@Req() request: AuthedRequest) {
    return this.authService.logoutAll(request.user);
  }

  /**
   * Chiqish uchun tokenning imzosi tekshiriladi, lekin muddati tugagani
   * to'sqinlik qilmasligi kerak — shuning uchun `AuthGuard` emas, servisdagi
   * alohida usul ishlatiladi.
   */
  private sessionIdFromHeader(request: Request): string | undefined {
    const [scheme, token] = (request.headers.authorization || '').split(' ');
    if (scheme !== 'Bearer' || !token) return undefined;

    return this.authService.sessionIdFromToken(token);
  }
}
