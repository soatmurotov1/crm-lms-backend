import { Prisma } from '@prisma/client';
import {
  tashkentDateKey,
  weekStartKey,
} from 'src/common/utils/tashkent-time.util';
import type { StudentBalance } from '../common/v2-balance';

const DAY_MS = 24 * 60 * 60 * 1000;

export type TrendRow = { paidAt: Date | null; amount: Prisma.Decimal };

/**
 * Tushumni Toshkent kuni yoki haftasi (dushanbadan) bo'yicha guruhlaydi.
 * Tushumi yo'q davr ro'yxatga kirmaydi.
 */
export function bucketRevenueTrend(
  rows: TrendRow[],
  granularity: 'day' | 'week',
): { period_start: string; amount: number; payment_count: number }[] {
  const buckets = new Map<string, { amount: Prisma.Decimal; count: number }>();

  for (const row of rows) {
    if (!row.paidAt) continue;

    const dayKey = tashkentDateKey(row.paidAt);
    const key = granularity === 'week' ? weekStartKey(dayKey) : dayKey;
    const bucket = buckets.get(key);

    if (bucket) {
      bucket.amount = bucket.amount.plus(row.amount);
      bucket.count += 1;
    } else {
      buckets.set(key, { amount: row.amount, count: 1 });
    }
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([period_start, bucket]) => ({
      period_start,
      amount: bucket.amount.toNumber(),
      payment_count: bucket.count,
    }));
}

export type DebtAging = {
  bucket_0_30: number;
  bucket_31_60: number;
  bucket_61_90: number;
  bucket_90_plus: number;
};

/**
 * Qarz summasini "yoshi" bo'yicha taqsimlaydi. Yosh oxirgi to'lovdan
 * sanaladi; hali to'lamagan o'quvchi uchun — guruhga qo'shilgan kundan.
 */
export function ageDebts(
  debtors: StudentBalance[],
  lastPaymentAt: Map<number, Date>,
  now: Date,
): DebtAging {
  const aging: DebtAging = {
    bucket_0_30: 0,
    bucket_31_60: 0,
    bucket_61_90: 0,
    bucket_90_plus: 0,
  };

  for (const debtor of debtors) {
    const since = lastPaymentAt.get(debtor.studentId) ?? debtor.since;
    const days = Math.max(
      0,
      Math.floor((now.getTime() - since.getTime()) / DAY_MS),
    );
    const key: keyof DebtAging =
      days <= 30
        ? 'bucket_0_30'
        : days <= 60
          ? 'bucket_31_60'
          : days <= 90
            ? 'bucket_61_90'
            : 'bucket_90_plus';

    aging[key] += debtor.debt.toNumber();
  }

  return aging;
}

/** O'tgan davrga nisbatan o'zgarish, foizda. O'tgan davr 0 bo'lsa — `null`. */
export function deltaPercent(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
