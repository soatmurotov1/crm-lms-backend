import { WeekDays } from '@prisma/client';
import {
  addDays,
  daysBetween,
  isValidDateKey,
  monthStartKey,
  tashkentDateKey,
  tashkentDayStart,
  weekDayOf,
  weekStartKey,
} from './tashkent-time.util';

describe('tashkent-time', () => {
  it('UTC kechqurun — Toshkentda allaqachon ertangi kun', () => {
    // 19:30 UTC = 00:30 Toshkent (UTC+5)
    expect(tashkentDateKey(new Date('2026-10-09T19:30:00.000Z'))).toBe(
      '2026-10-10',
    );
    expect(tashkentDateKey(new Date('2026-10-09T18:59:59.999Z'))).toBe(
      '2026-10-09',
    );
  });

  it('kun boshi UTC da 5 soat oldin', () => {
    expect(tashkentDayStart('2026-10-10').toISOString()).toBe(
      '2026-10-09T19:00:00.000Z',
    );
  });

  it('kun qo‘shish oy va yil chegarasidan o‘tadi', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('kunlar farqi', () => {
    expect(daysBetween('2026-10-01', '2026-10-09')).toBe(8);
    expect(daysBetween('2026-10-09', '2026-10-09')).toBe(0);
  });

  it('hafta dushanbadan boshlanadi', () => {
    expect(weekStartKey('2026-10-11')).toBe('2026-10-05'); // yakshanba
    expect(weekStartKey('2026-10-12')).toBe('2026-10-12'); // dushanba
    expect(weekStartKey('2026-10-14')).toBe('2026-10-12');
  });

  it('oy boshi va hafta kuni', () => {
    expect(monthStartKey('2026-10-09')).toBe('2026-10-01');
    expect(weekDayOf('2026-10-12')).toBe(WeekDays.MONDAY);
    expect(weekDayOf('2026-10-11')).toBe(WeekDays.SUNDAY);
  });

  it('kalendarda yo‘q yoki noto‘g‘ri formatdagi sanani rad etadi', () => {
    expect(isValidDateKey('2026-10-09')).toBe(true);
    expect(isValidDateKey('2026-02-31')).toBe(false);
    expect(isValidDateKey('2026-13-01')).toBe(false);
    expect(isValidDateKey('2026-1-1')).toBe(false);
    expect(isValidDateKey('09.10.2026')).toBe(false);
    expect(isValidDateKey('')).toBe(false);
  });
});
