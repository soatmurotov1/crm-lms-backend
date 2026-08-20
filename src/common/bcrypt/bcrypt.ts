import * as bcrypt from 'bcrypt';

/**
 * `tsconfig` da `noImplicitAny: false` bo'lgani uchun bu funksiyalarning
 * parametrlari e'lonsiz qolgan va jimgina `any` bo'lib ketgan edi. Ya'ni
 * parol o'rniga obyekt yoki `undefined` uzatilsa, TypeScript indamasdi va
 * xato faqat ish vaqtida chiqardi.
 */

/** bcrypt "cost factor" — 10 dan 12 ga ko'tarish vaqtni ~4 barobar oshiradi. */
const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(
  plainPassword: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plainPassword, hash);
}
