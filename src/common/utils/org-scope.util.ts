import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';

import type { RequestUser } from '../guard/current-user.decorator';

/**
 * Har bir tashkilotning ma'lumoti alohida saqlanadi: bitta tashkilot admini
 * boshqasining kurslari, xonalari, o'qituvchilari, o'quvchilari va guruhlarini
 * ko'rmasligi kerak.
 *
 * SUPERADMIN — platforma egasi, u hamma tashkilotni ko'radi. Shuning uchun
 * uning uchun filtr qo'yilmaydi (`undefined` qaytadi).
 */
export const isSuperAdmin = (user?: RequestUser | null) =>
  user?.role === Role.SUPERADMIN;

/**
 * `where` uchun tashkilot filtri.
 *
 *   where: { status, ...orgFilter(user) }
 *
 * SUPERADMIN uchun bo'sh obyekt qaytadi, ya'ni hech narsa cheklanmaydi.
 */
export function orgFilter(user?: RequestUser | null): {
  organizationId?: number | null;
} {
  if (isSuperAdmin(user)) return {};
  return { organizationId: user?.organizationId ?? null };
}

/**
 * Bog'liq jadval orqali filtrlash uchun — masalan dars guruh orqali:
 *
 *   where: { group: orgRelationFilter(user) }
 */
export function orgRelationFilter(user?: RequestUser | null): {
  organizationId?: number | null;
} {
  return orgFilter(user);
}

/**
 * Yangi yozuv qaysi tashkilotga tegishli ekani. SUPERADMIN tashkilotga
 * biriktirilmagani uchun u yaratgan yozuv `null` bo'lib qolmasligi kerak —
 * shuning uchun u tashkilotni ochiq ko'rsatishi shart.
 */
export function resolveOwnerOrganizationId(
  user: RequestUser | null | undefined,
  explicitOrganizationId?: number | null,
): number | null {
  if (isSuperAdmin(user)) {
    return explicitOrganizationId ?? null;
  }

  if (!user?.organizationId) {
    throw new ForbiddenException(
      "Hisobingiz tashkilotga biriktirilmagan. Super admin bilan bog'laning.",
    );
  }

  return user.organizationId;
}

/**
 * Topilgan yozuv so'rovchining tashkilotiga tegishlimi. Tegishli bo'lmasa
 * "topilmadi" deb ko'rsatish xavfsizroq: boshqa tashkilotda shu id borligi
 * ham oshkor bo'lmaydi. Shu sababli bu funksiya faqat `true/false` qaytaradi,
 * xatoni chaqiruvchi o'zi tanlaydi.
 */
export function belongsToOrg(
  user: RequestUser | null | undefined,
  record: { organizationId?: number | null } | null | undefined,
): boolean {
  if (!record) return false;
  if (isSuperAdmin(user)) return true;
  return record.organizationId === (user?.organizationId ?? null);
}
