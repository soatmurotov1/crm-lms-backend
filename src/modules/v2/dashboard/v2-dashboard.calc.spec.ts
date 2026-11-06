import { CourseType, Prisma } from '@prisma/client';
import type { StudentBalance } from '../common/v2-balance';
import {
  ageDebts,
  bucketRevenueTrend,
  deltaPercent,
} from './v2-dashboard.calc';

const d = (value: number) => new Prisma.Decimal(value);

describe('bucketRevenueTrend', () => {
  it('Toshkent kuni bo‘yicha guruhlaydi va to‘lovlarni sanaydi', () => {
    const trend = bucketRevenueTrend(
      [
        // 12-oktabr 23:30 UTC — Toshkentda allaqachon 13-oktabr.
        { paidAt: new Date('2026-10-12T23:30:00Z'), amount: d(100) },
        { paidAt: new Date('2026-10-13T06:00:00Z'), amount: d(50) },
        { paidAt: new Date('2026-10-11T06:00:00Z'), amount: d(10) },
        { paidAt: null, amount: d(999) },
      ],
      'day',
    );

    expect(trend).toEqual([
      { period_start: '2026-10-11', amount: 10, payment_count: 1 },
      { period_start: '2026-10-13', amount: 150, payment_count: 2 },
    ]);
  });

  it('hafta dushanbadan boshlanadi', () => {
    const trend = bucketRevenueTrend(
      [
        { paidAt: new Date('2026-10-13T06:00:00Z'), amount: d(100) }, // seshanba
        { paidAt: new Date('2026-10-18T06:00:00Z'), amount: d(40) }, // yakshanba
        { paidAt: new Date('2026-10-19T06:00:00Z'), amount: d(5) }, // dushanba
      ],
      'week',
    );

    expect(trend).toEqual([
      { period_start: '2026-10-12', amount: 140, payment_count: 2 },
      { period_start: '2026-10-19', amount: 5, payment_count: 1 },
    ]);
  });
});

describe('ageDebts', () => {
  const now = new Date('2026-10-13T12:00:00Z');
  const debtor = (studentId: number, debt: number, since: string) =>
    ({
      studentId,
      fullName: `O‘quvchi ${studentId}`,
      branchId: 1,
      branchName: 'Asosiy filial',
      courseType: CourseType.AUTO_SCHOOL,
      totalPrice: d(debt),
      paid: d(0),
      debt: d(debt),
      since: new Date(since),
    }) satisfies StudentBalance;

  it('yoshni oxirgi to‘lovdan, u bo‘lmasa qo‘shilgan kundan sanaydi', () => {
    const aging = ageDebts(
      [
        debtor(1, 100, '2026-10-01T00:00:00Z'), // 12 kun
        debtor(2, 200, '2026-08-25T00:00:00Z'), // 49 kun
        debtor(3, 300, '2026-07-20T00:00:00Z'), // 85 kun
        debtor(4, 400, '2026-01-01T00:00:00Z'), // 90+
        // Eski qo'shilgan, lekin yaqinda to'lagan — 0–30 ga tushadi.
        debtor(5, 50, '2026-01-01T00:00:00Z'),
      ],
      new Map([[5, new Date('2026-10-10T00:00:00Z')]]),
      now,
    );

    expect(aging).toEqual({
      bucket_0_30: 150,
      bucket_31_60: 200,
      bucket_61_90: 300,
      bucket_90_plus: 400,
    });
  });
});

describe('deltaPercent', () => {
  it('o‘tgan davr nol bo‘lsa solishtirib bo‘lmaydi', () => {
    expect(deltaPercent(500, 0)).toBeNull();
  });

  it('bitta kasr xonasigacha yaxlitlaydi', () => {
    expect(deltaPercent(150, 100)).toBe(50);
    expect(deltaPercent(100, 300)).toBe(-66.7);
  });
});
