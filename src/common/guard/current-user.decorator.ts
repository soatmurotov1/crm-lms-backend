import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';

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
 * `AuthGuard` o'tgan so'rov.
 *
 * `user` shart emas deb belgilangan: guard'siz endpointda ham shu tip
 * ishlatilishi mumkin, unda `user` bo'lmaydi. Guard qo'yilgan joyda
 * `@CurrentUser()` dekoratori uni allaqachon ajratib beradi, shuning uchun
 * kontrollerlar bu tipni to'g'ridan-to'g'ri ishlatmaydi.
 */
export interface AuthedRequest extends Request {
  user?: RequestUser;
}

/**
 * Kontrollerlarda `@Req() req` yozib `req.user` ni qo'lda olish o'rniga:
 *
 *   getAll(@CurrentUser() user: RequestUser) { ... }
 *
 * Ilgari kontrollerlar `@Req() req: Request` deb yozardi, lekin `Request`
 * hech qayerdan import qilinmagani uchun u global (Fetch API) `Request` ga
 * bog'lanardi. Unda `user` maydoni yo'q, natijada `req['user']` "error type"
 * bo'lib, undan keyingi barcha tekshiruv o'chib qolardi — rol va
 * `organizationId` tekshiruvlari tipsiz ma'lumot ustida ishlardi.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof RequestUser | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const user = request.user;

    return data ? user?.[data] : user;
  },
);
