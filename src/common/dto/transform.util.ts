import type { TransformFnParams } from 'class-transformer';
import { WeekDays } from '@prisma/client';

/**
 * DTO'lar uchun umumiy `@Transform` yordamchilari.
 *
 * Bular ilgari har bir DTO faylida qaytadan yozilgan edi (`emptyToUndefined`
 * o'n bir joyda, `toWeekDaysArray` ikki joyda). Nusxalar bir-biridan
 * ajralib ketishi mumkin — masalan bittasida `trim()` bo'lib, boshqasida
 * bo'lmasligi — va bu validatsiya xatti-harakati endpointdan endpointga
 * farq qilishiga olib keladi.
 *
 * Qaytish tipi ataylab `unknown`: `class-transformer` qiymatni `any` deb
 * beradi va uni tekshirmasdan qaytarish TypeScript uchun "bu yerdan keyin
 * tekshirma" degani bo'lardi.
 */

/**
 * Bo'sh matnni `undefined` ga aylantiradi.
 *
 * Forma yuborilganda to'ldirilmagan maydon `""` bo'lib keladi. `@IsOptional()`
 * esa faqat `undefined` ni o'tkazib yuboradi, `""` ni emas — natijada
 * ixtiyoriy maydon "bo'sh bo'lmasin" xatosini beradi.
 */
export const emptyToUndefined = ({ value }: TransformFnParams): unknown => {
  if (typeof value !== 'string') return value as unknown;

  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

/** Matnli maydondan ortiqcha bo'shliqni olib tashlaydi (bo'sh qiymat qoladi). */
export const trimString = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : (value as unknown);

/** Har qanday kirishni bo'shliqsiz matnga keltiradi. */
export const toTrimmedString = ({ value }: TransformFnParams): string =>
  String(value ?? '').trim();

const WEEK_DAYS = new Set<string>(Object.values(WeekDays));

/**
 * Hafta kunlarini massivga keltiradi.
 *
 * Kunlar uch xil ko'rinishda kelishi mumkin: haqiqiy massiv (JSON body),
 * JSON matni (`"[\"MONDAY\"]"`) va vergul bilan ajratilgan matn
 * (`"MONDAY,WEDNESDAY"` — `multipart/form-data` da massiv yuborib
 * bo'lmagani uchun).
 *
 * Noma'lum qiymatlar shu yerda o'chirilmaydi: ularni `@IsEnum` ushlaydi va
 * foydalanuvchiga qaysi kun noto'g'ri ekanini aytadi. Jimgina tashlab
 * yuborilsa, xato o'rniga "kun saqlanmadi" holati chiqardi.
 */
export const toWeekDaysArray = ({ value }: TransformFnParams): unknown => {
  if (Array.isArray(value)) return value as unknown;
  if (typeof value !== 'string') return value as unknown;

  const trimmed = value.trim();
  if (!trimmed) return value;

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // JSON emas ekan — quyidagi vergulli/yakka qiymat yo'liga tushadi.
    }
  }

  if (trimmed.includes(',')) {
    return trimmed
      .split(',')
      .map((day) => day.trim())
      .filter(Boolean);
  }

  return [trimmed];
};

/** Faqat sxemada mavjud kun nomlarimi — xizmat qatlami uchun. */
export const isWeekDay = (value: unknown): value is WeekDays =>
  typeof value === 'string' && WEEK_DAYS.has(value);
