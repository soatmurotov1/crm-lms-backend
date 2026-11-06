import {
  Body,
  ForbiddenException,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  LoginThrottleGuard,
  SkipLoginThrottle,
} from 'src/common/guard/login-throttle.guard';
import { getClientIp } from 'src/common/utils/client-ip.util';
import {
  CurrentActor,
  V2AuthGuard,
  type V2Actor,
} from '../common/v2-auth.guard';
import { V2Controller } from '../common/v2-controller.decorator';
import {
  V2_SESSION_COOKIE,
  clearSessionCookie,
  readCookie,
  setSessionCookie,
} from '../common/v2-cookie';
import { V2ChangePasswordDto, V2LoginDto } from './dto/v2-auth.dto';
import { V2AuthService, type V2AuthResult } from './v2-auth.service';

function requestContext(request: Request) {
  return {
    ipAddress: getClientIp(request),
    userAgent: request.headers['user-agent'],
  };
}

@V2Controller('auth')
@UseGuards(LoginThrottleGuard)
export class V2AuthController {
  constructor(private readonly authService: V2AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Email va parol bilan kirish (xodimlar)' })
  async login(
    @Body() payload: V2LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.respond(
      response,
      await this.authService.login(payload, requestContext(request)),
    );
  }

  @Get('me')
  @SkipLoginThrottle()
  @UseGuards(V2AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Joriy foydalanuvchi — sessiyani tiklash uchun' })
  async me(@CurrentActor() actor: V2Actor) {
    return { data: await this.authService.me(actor.ref) };
  }

  /**
   * Bir bosishda demo hisobiga kirish. Bu o'rnatishda demo hisob yo'q —
   * frontend `VITE_ENABLE_DEMO_LOGIN=false` bilan tugmani ko'rsatmaydi.
   */
  @Post('demo')
  @SkipLoginThrottle()
  @ApiOperation({ summary: 'Demo kirish (bu serverda o‘chirilgan)' })
  demo(): never {
    throw new ForbiddenException('Demo kirish bu serverda o‘chirilgan');
  }

  @Patch('me/crm-tour')
  @SkipLoginThrottle()
  @UseGuards(V2AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tanishtiruv turi tugatildi deb belgilash' })
  async completeCrmTour(@CurrentActor() actor: V2Actor) {
    return { data: await this.authService.completeCrmTour(actor.ref) };
  }

  @Post('change-password')
  @UseGuards(V2AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Parolni almashtirish' })
  async changePassword(
    @CurrentActor() actor: V2Actor,
    @Body() payload: V2ChangePasswordDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.respond(
      response,
      await this.authService.changePassword(
        actor.ref,
        payload,
        requestContext(request),
      ),
    );
  }

  /** Guard yo'q: token eskirgan bo'lsa ham chiqish ishlashi kerak. */
  @Post('logout')
  @HttpCode(204)
  @SkipLoginThrottle()
  @ApiOperation({ summary: 'Chiqish — sessiya serverda yopiladi' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const [scheme, bearer] = (request.headers.authorization || '').split(' ');

    await this.authService.logout(
      scheme === 'Bearer' && bearer
        ? bearer
        : readCookie(request.headers.cookie, V2_SESSION_COOKIE),
    );
    clearSessionCookie(response);
  }

  private respond(response: Response, result: V2AuthResult) {
    setSessionCookie(response, result.token, result.expiresAt);

    return { data: { token: result.token, user: result.user } };
  }
}
