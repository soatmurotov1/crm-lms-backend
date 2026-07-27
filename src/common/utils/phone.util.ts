
/**
 * Telefon raqami login identifikatori bo'lgani uchun bazaga har doim bitta
 * ko'rinishda (`+998901234567`) yoziladi. Foydalanuvchi `+998 90 123-45-67`
 * yoki `90 123 45 67` deb kiritsa ham bir xil natija chiqishi kerak.
 */
export const PHONE_REGEX = /^\+998\d{9}$/;

export const PHONE_FORMAT_MESSAGE =
  "Telefon raqami +998XXXXXXXXX ko'rinishida bo'lishi kerak";

export function normalizePhone(raw: unknown): string {
  if (typeof raw !== 'string') return '';

  const digits = raw.replace(/\D/g, '');

  if (digits.length === 9) return `+998${digits}`;
  if (digits.length === 12 && digits.startsWith('998')) return `+${digits}`;

  // Formatga tushmasa - o'zini qaytaramiz, validator xatoni ushlaydi.
  return raw.trim();
}
