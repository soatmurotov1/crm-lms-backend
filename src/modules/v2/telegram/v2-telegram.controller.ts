import {
  Body,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import {
  CurrentActor,
  V2AuthGuard,
  V2Roles,
  type V2Actor,
} from '../common/v2-auth.guard';
import { V2Controller } from '../common/v2-controller.decorator';
import { V2TelegramService } from './v2-telegram.service';

export class V2TelegramToggleDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}

/** Hisobotlar rahbariyat uchun; bog'lashning o'zi har bir xodimga ochiq. */
const REPORT_ROLES = ['dev', 'owner', 'manager', 'accountant'] as const;

@V2Controller('telegram')
@ApiBearerAuth()
@UseGuards(V2AuthGuard)
export class V2TelegramController {
  constructor(private readonly telegram: V2TelegramService) {}

  @Get('link-status')
  @ApiOperation({ summary: 'Telegram bog‘langanmi' })
  status(@CurrentActor() actor: V2Actor) {
    return this.telegram.status(actor);
  }

  @Post('link-token')
  @HttpCode(200)
  @ApiOperation({ summary: 'Botga bog‘lash havolasi' })
  linkToken(@CurrentActor() actor: V2Actor) {
    return this.telegram.linkToken(actor);
  }

  @Delete('link')
  @HttpCode(204)
  @ApiOperation({ summary: 'Telegramni uzish' })
  unlink(@CurrentActor() actor: V2Actor) {
    return this.telegram.unlink(actor);
  }

  @Patch('daily-report')
  @V2Roles(...REPORT_ROLES)
  @ApiOperation({ summary: 'Kunlik hisobotni yoqish/o‘chirish' })
  dailyReport(
    @CurrentActor() actor: V2Actor,
    @Body() payload: V2TelegramToggleDto,
  ) {
    return this.telegram.setDailyReport(actor, payload.enabled);
  }

  @Patch('expense-digest')
  @V2Roles(...REPORT_ROLES)
  @ApiOperation({ summary: 'Xarajatlar dayjestini yoqish/o‘chirish' })
  expenseDigest(
    @CurrentActor() actor: V2Actor,
    @Body() payload: V2TelegramToggleDto,
  ) {
    return this.telegram.setExpenseDigest(actor, payload.enabled);
  }

  @Post('expense-digest/snooze')
  @HttpCode(200)
  @V2Roles(...REPORT_ROLES)
  @ApiOperation({ summary: 'Dayjestni bir haftaga to‘xtatish' })
  snooze(@CurrentActor() actor: V2Actor) {
    return this.telegram.snoozeDigest(actor);
  }
}
