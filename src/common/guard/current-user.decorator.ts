import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '@prisma/client';

/**
 * `AuthGuard` so'rovga biriktiradigan foydalanuvchi ma'lumoti.
 * `organizationId` bazadan olinadi, tokendan emas.
 */
export type RequestUser = {
  id: number;
  phone: string;
  fullName: string;
  role: Role;
  organizationId: number | null;
};

/**
 * Kontrollerlarda `@Req() req` yozib `req.user` ni qo'lda olish o'rniga:
 *
 *   getAll(@CurrentUser() user: RequestUser) { ... }
 */
export const CurrentUser = createParamDecorator(
  (data: keyof RequestUser | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest();
    const user: RequestUser | undefined = request.user;

    return data ? user?.[data] : user;
  },
);
