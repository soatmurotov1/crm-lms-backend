import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getClientIp } from '../utils/client-ip.util';

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60 * 1000;

const SKIP_LOGIN_THROTTLE = 'skipLoginThrottle';

/**
 * Parol tekshirmaydigan endpointlarni chegaradan chiqaradi.
 *
 * Bu shart: o'quv markazining hamma kompyuteri bitta tashqi IP orqali
 * chiqadi. Token yangilash ham shu chegaraga tushsa, o'nta o'qituvchi bir
 * vaqtda ishlaganda beshinchisidan keyingisi tizimdan uchib ketardi.
 */
export const SkipLoginThrottle = () => SetMetadata(SKIP_LOGIN_THROTTLE, true);

/**
 * Login urinishlarini IP bo'yicha cheklaydi (brute-force himoyasi).
 * Hisoblagichlar process xotirasida saqlanadi, ya'ni server qayta ishga
 * tushganda tozalanadi va instansiyalar o'rtasida bo'linmaydi.
 */
@Injectable()
export class LoginThrottleGuard implements CanActivate {
  private readonly attempts = new Map<
    string,
    { count: number; resetAt: number }
  >();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_LOGIN_THROTTLE,
      [context.getHandler(), context.getClass()],
    );

    if (skip) return true;

    const req = context.switchToHttp().getRequest();
    const now = Date.now();

    this.prune(now);

    const key = `${getClientIp(req)}:${req.route?.path || req.url}`;
    const entry = this.attempts.get(key);

    if (!entry || entry.resetAt <= now) {
      this.attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return true;
    }

    if (entry.count >= MAX_ATTEMPTS) {
      throw new HttpException(
        "Juda ko'p urinish. Iltimos, birozdan so'ng qayta urinib ko'ring",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    entry.count += 1;
    return true;
  }

  private prune(now: number) {
    for (const [key, entry] of this.attempts) {
      if (entry.resetAt <= now) {
        this.attempts.delete(key);
      }
    }
  }
}
