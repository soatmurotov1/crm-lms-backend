import type { TransformFnParams } from 'class-transformer';

/**
 * DTO transformerlari.
 *
 * Global `ValidationPipe` `enableImplicitConversion` bilan ishlaydi: so'rov
 * qatoridagi `"false"` matni boolean maydonga `true` bo'lib keladi. Shuning
 * uchun boolean qiymat `obj` dan (o'zgarmagan xom qiymatdan) o'qiladi.
 */
export const toBool = ({ obj, key }: TransformFnParams): unknown => {
  const raw = (obj as Record<string, unknown>)[key];

  if (raw === undefined || raw === null || raw === '') return undefined;
  if (raw === true || raw === 'true' || raw === '1' || raw === 1) return true;
  if (raw === false || raw === 'false' || raw === '0' || raw === 0) return false;

  return raw;
};

export const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Bo'sh satr → `undefined` (maydon yuborilmagandek). */
export const emptyToUndefined = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

/** Bo'sh satr → `null` (maydonni tozalash). */
export const emptyToNull = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' && value.trim() === '' ? null : value;

/** Matn sifatida kelgan id → matn (son kelib qolsa ham). */
export const toIdString = ({ value }: TransformFnParams): unknown =>
  typeof value === 'number' ? String(value) : value;

/** `YYYY-MM-DD` */
export const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
/** `HH:mm` */
export const TIME_HM = /^([01]\d|2[0-3]):[0-5]\d$/;
/** `YYYY-MM` */
export const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;
/** Musbat pul miqdori, ikki kasr xonasigacha: `125000.00` */
export const MONEY_STRING = /^\d{1,12}(\.\d{1,2})?$/;
