import { randomInt } from 'node:crypto';

const CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';

/**
 * Tasodifiy parol. `Math.random()` kriptografik emas — uning holatini bir
 * nechta natijadan tiklab, keyingi parollarni oldindan aytib berish mumkin.
 * Shuning uchun `crypto.randomInt` (CSPRNG) ishlatiladi.
 */
export function generateRandomPassword(length: number = 12): string {
  return Array.from({ length }, () => CHARS[randomInt(CHARS.length)]).join('');
}
