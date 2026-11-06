import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

const CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
};

/**
 * Frontend xatoni `{ error: { code, message, details } }` ko'rinishida kutadi.
 * Nest'ning standart javobi (`{ statusCode, message, error }`) bilan u
 * serverdagi matnni ko'rsata olmaydi va umumiy "Xatolik" yozuvini chiqaradi.
 *
 * class-validator xatolari `details` ro'yxatiga tushadi — forma ularni
 * maydon bo'yicha ko'rsatadi.
 */
@Catch()
export class V2ExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(V2ExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (!(exception instanceof HttpException)) {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );

      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Serverda xatolik yuz berdi',
        },
      });
      return;
    }

    const status = exception.getStatus();
    const body = exception.getResponse();
    const raw =
      typeof body === 'string'
        ? body
        : (body as { message?: string | string[] }).message;

    if (Array.isArray(raw)) {
      res.status(status).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: raw,
        },
      });
      return;
    }

    const details =
      typeof body === 'object' && body !== null
        ? (body as { details?: unknown }).details
        : undefined;

    res.status(status).json({
      error: {
        code: CODES[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'ERROR'),
        message: raw ?? exception.message,
        ...(details !== undefined ? { details } : {}),
      },
    });
  }
}
