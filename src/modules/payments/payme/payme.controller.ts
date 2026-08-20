import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { timingSafeEqual } from 'crypto';
import { PaymeService } from './payme.service';
import {
  PaymeError,
  PaymeErrorCode,
  type PaymeRequest,
  paymeMessage,
} from './payme.types';

/**
 * Payme Merchant API uchun yagona kirish nuqtasi: `POST /api/payments/payme`.
 *
 * Shu manzilni Payme kabinetidagi "Endpoint URL" maydoniga yozish kerak.
 *
 * Ikki muhim jihat:
 *  1. Javob HAR DOIM HTTP 200 bo'ladi - xato ham tanadagi `error` obyektida.
 *     Boshqa status kodini ko'rsa Payme uni tarmoq nosozligi deb hisoblaydi
 *     va so'rovni qayta-qayta yuboraveradi.
 *  2. So'rovlar throttler'dan ozod: Payme hisob-kitobni solishtirishda
 *     ketma-ket ko'p so'rov yuboradi va 429 olsa to'lovlar osilib qoladi.
 *     Himoya throttler emas, `Authorization` sarlavhasi orqali ta'minlanadi.
 */
@ApiExcludeController()
@SkipThrottle()
@Controller('payments/payme')
export class PaymeController {
  private readonly logger = new Logger(PaymeController.name);

  constructor(private readonly paymeService: PaymeService) {}

  @Post()
  @HttpCode(200)
  async handle(
    @Body() body: PaymeRequest,
    @Headers('authorization') authorization?: string,
  ) {
    const rpcId = body?.id ?? null;

    try {
      this.assertAuthorized(authorization);

      const params = body?.params ?? {};
      const result = await this.dispatch(body?.method, params);

      return { result, id: rpcId };
    } catch (error) {
      if (error instanceof PaymeError) {
        return {
          error: {
            code: error.code,
            message: error.localized,
            ...(error.data ? { data: error.data } : {}),
          },
          id: rpcId,
        };
      }

      // Kutilmagan xato ham Payme tushunadigan formatda qaytishi kerak,
      // aks holda u so'rovni cheksiz qayta yuboradi.
      this.logger.error(
        `Payme so'rovida kutilmagan xato (method=${body?.method}): ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );

      return {
        error: {
          code: PaymeErrorCode.UNABLE_TO_PERFORM,
          message: paymeMessage(
            'Ichki xatolik',
            'Внутренняя ошибка',
            'Internal error',
          ),
        },
        id: rpcId,
      };
    }
  }

  private dispatch(
    method: string | undefined,
    params: Record<string, unknown>,
  ) {
    switch (method) {
      case 'CheckPerformTransaction':
        return this.paymeService.checkPerformTransaction(params);
      case 'CreateTransaction':
        return this.paymeService.createTransaction(params);
      case 'PerformTransaction':
        return this.paymeService.performTransaction(params);
      case 'CancelTransaction':
        return this.paymeService.cancelTransaction(params);
      case 'CheckTransaction':
        return this.paymeService.checkTransaction(params);
      case 'GetStatement':
        return this.paymeService.getStatement(params);
      default:
        throw new PaymeError(
          PaymeErrorCode.METHOD_NOT_FOUND,
          paymeMessage(
            'Bunday metod mavjud emas',
            'Метод не найден',
            'Method not found',
          ),
        );
    }
  }

  /**
   * Payme `Authorization: Basic base64("Paycom:<PAYME_KEY>")` yuboradi.
   * Kalitni taqqoslashda `timingSafeEqual` ishlatiladi - oddiy `===` javob
   * qaytish vaqti orqali kalitni belgima-belgi topib olishga imkon beradi.
   */
  private assertAuthorized(authorization?: string) {
    const expectedKey = process.env.PAYME_KEY || '';

    if (!expectedKey) {
      this.logger.error('PAYME_KEY sozlanmagan - webhook rad etildi');
      throw new PaymeError(
        PaymeErrorCode.INSUFFICIENT_PRIVILEGE,
        paymeMessage(
          'Sozlama topilmadi',
          'Настройка отсутствует',
          'Configuration missing',
        ),
      );
    }

    const denied = new PaymeError(
      PaymeErrorCode.INSUFFICIENT_PRIVILEGE,
      paymeMessage(
        'Ruxsat yetarli emas',
        'Недостаточно привилегий',
        'Insufficient privilege',
      ),
    );

    if (!authorization?.startsWith('Basic ')) throw denied;

    const decoded = Buffer.from(
      authorization.slice('Basic '.length),
      'base64',
    ).toString('utf8');

    // Kalitning o'zida ham `:` bo'lishi mumkin - shuning uchun faqat
    // birinchi ajratuvchi bo'yicha bo'lamiz.
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) throw denied;

    const login = decoded.slice(0, separatorIndex);
    const key = decoded.slice(separatorIndex + 1);

    if (login !== 'Paycom') throw denied;

    const received = Buffer.from(key);
    const expected = Buffer.from(expectedKey);

    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      throw denied;
    }
  }
}
