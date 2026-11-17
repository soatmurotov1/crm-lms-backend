import type { CookieOptions, Response } from 'express';

/** Sessiya tokeni saqlanadigan httpOnly cookie. */
export const V2_SESSION_COOKIE = 'crm_session';

/**
 * `Cookie` sarlavhasidan bitta qiymatni o'qiydi. Bitta cookie uchun
 * `cookie-parser` ni butun ilovaga ulash shart emas.
 */
export function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  if (!header) return undefined;

  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== name) continue;

    const value = part.slice(index + 1).trim();

    try {
      return decodeURIComponent(value) || undefined;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

/**
 * Cookie sozlamalari.
 *
 * Standart `SameSite=Lax`: frontend va API bitta saytda (masalan
 * `app.example.uz` va `api.example.uz`, yoki ikkalasi `localhost`) bo'lsa
 * shuning o'zi yetadi va begona saytdan kelgan so'rovga cookie qo'shilmaydi.
 * Ular butunlay boshqa domenlarda tursa `V2_COOKIE_SAMESITE=none` qo'yiladi
 * (bu holda cookie faqat HTTPS orqali yuradi).
 */
function cookieOptions(): CookieOptions {
  const sameSite =
    process.env.V2_COOKIE_SAMESITE?.toLowerCase() === 'none' ? 'none' : 'lax';

  return {
    httpOnly: true,
    sameSite,
    secure: sameSite === 'none' || process.env.NODE_ENV === 'production',
    path: '/api/v2',
    ...(process.env.V2_COOKIE_DOMAIN
      ? { domain: process.env.V2_COOKIE_DOMAIN }
      : {}),
  };
}

export function setSessionCookie(
  res: Response,
  token: string,
  expiresAt: Date,
): void {
  res.cookie(V2_SESSION_COOKIE, token, {
    ...cookieOptions(),
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(V2_SESSION_COOKIE, cookieOptions());
}

/**
 * O'quvchi kabineti sessiyasi — xodim sessiyasidan alohida cookie, shunda bitta
 * brauzerda xodim va o'quvchi bir-birining sessiyasini buzmaydi.
 */
export const V2_LEARNER_COOKIE = 'learner_session';

export function setLearnerCookie(
  res: Response,
  token: string,
  expiresAt: Date,
): void {
  res.cookie(V2_LEARNER_COOKIE, token, {
    ...cookieOptions(),
    expires: expiresAt,
  });
}

export function clearLearnerCookie(res: Response): void {
  res.clearCookie(V2_LEARNER_COOKIE, cookieOptions());
}
