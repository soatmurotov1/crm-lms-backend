/**
 * `catch (error)` dagi qiymatning matnini xavfsiz oladi.
 *
 * JavaScript'da `throw` istalgan qiymatni tashlashi mumkin, shuning uchun
 * `catch` parametri `Error` emas. `error.message` deb yozish TypeScript
 * uchun tekshiruvsiz murojaat, ish vaqtida esa `undefined` bo'lib
 * "Upload failed: undefined" kabi foydasiz xabar beradi.
 */
export function getErrorMessage(error: unknown, fallback = 'Nomaʼlum xato') {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;

  return fallback;
}
