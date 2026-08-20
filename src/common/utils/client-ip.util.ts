import type { Request } from 'express';

/**
 * So'rov egasining IP manzili.
 *
 * `X-Forwarded-For` ni to'g'ridan-to'g'ri o'qish mumkin emas: uni istalgan
 * mijoz o'zi yozib yuboradi va shu bilan IP bo'yicha cheklovlarni (login
 * urinishlari, SMS yuborish) cheksiz aylanib o'tadi hamda LoginLog dagi
 * audit yozuvlarini soxtalashtiradi.
 *
 * `req.ip` esa `trust proxy` sozlamasiga tayanadi (main.ts) — ya'ni faqat
 * ishonchli proxy qo'shgan qiymat hisobga olinadi.
 */
export function getClientIp(request: Request): string {
  return request.ip || request.socket.remoteAddress || 'Unknown';
}
