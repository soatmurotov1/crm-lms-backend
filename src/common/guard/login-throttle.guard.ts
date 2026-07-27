import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { getClientIp } from '../utils/client-ip.util';

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60 * 1000;

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

  canActivate(context: ExecutionContext): boolean {
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
