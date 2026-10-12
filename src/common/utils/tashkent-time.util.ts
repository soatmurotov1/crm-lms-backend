import { WeekDays } from '@prisma/client';

/**
 * Toshkent vaqti (UTC+5, yozgi vaqtga o'tish yo'q).
 *
 * Server UTC da ishlaydi. "Bugungi tushum" server kuni bo'yicha hisoblansa,
 * 00:00–05:00 oralig'idagi to'lovlar kechagi kunga tushib qoladi. Shuning
 * uchun kun chegaralari shu yerda, bitta joyda hisoblanadi.
 *
 * Sana kaliti — `YYYY-MM-DD` matni: Toshkentdagi kalendar kuni.
 */
export const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const WEEK_DAYS: WeekDays[] = [
  WeekDays.SUNDAY,
  WeekDays.MONDAY,
  WeekDays.TUESDAY,
  WeekDays.WEDNESDAY,
  WeekDays.THURSDAY,
  WeekDays.FRIDAY,
  WeekDays.SATURDAY,
];

const utcMidnight = (key: string) => Date.parse(`${key}T00:00:00.000Z`);
const toKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Format to'g'ri VA sana kalendarda mavjud. `2026-02-31` V8 da jimgina
 * 3-martga aylanadi — qayta formatlab solishtirish shuni ushlaydi.
 */
export function isValidDateKey(key: string): boolean {
  if (!DATE_KEY.test(key)) return false;

  const ms = utcMidnight(key);
  return !Number.isNaN(ms) && toKey(ms) === key;
}

export function tashkentDateKey(instant: Date): string {
  return toKey(instant.getTime() + TASHKENT_OFFSET_MS);
}

/** Shu kun 00:00 (Toshkent) ga to'g'ri keladigan UTC lahza. */
export function tashkentDayStart(key: string): Date {
  return new Date(utcMidnight(key) - TASHKENT_OFFSET_MS);
}

export function addDays(key: string, days: number): string {
  return toKey(utcMidnight(key) + days * DAY_MS);
}

export function daysBetween(fromKey: string, toKeyValue: string): number {
  return Math.round((utcMidnight(toKeyValue) - utcMidnight(fromKey)) / DAY_MS);
}

/** Shu sana tushgan haftaning dushanbasi. */
export function weekStartKey(key: string): string {
  const dayOfWeek = new Date(utcMidnight(key)).getUTCDay(); // 0 = yakshanba
  return addDays(key, -((dayOfWeek + 6) % 7));
}

export function monthStartKey(key: string): string {
  return `${key.slice(0, 8)}01`;
}

export function weekDayOf(key: string): WeekDays {
  return WEEK_DAYS[new Date(utcMidnight(key)).getUTCDay()];
}
