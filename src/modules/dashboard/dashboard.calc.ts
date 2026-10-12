import { Prisma } from '@prisma/client';
import {
  tashkentDateKey,
  weekStartKey,
} from 'src/common/utils/tashkent-time.util';

/** Faol a'zolik: bitta o'quvchi bitta guruhda. */
export type MembershipRow = {
  studentId: number;
  groupId: number;
  /** Kursning UMUMIY narxi (oylik emas). */
  price: Prisma.Decimal;
  fullName: string;
  branchName: string | null;
};

/** Shu o'quvchi va guruh bo'yicha PAID to'lovlar yig'indisi. */
export type PaidRow = {
  studentId: number;
  groupId: number;
  paid: Prisma.Decimal | null;
};

export type DebtQueueItem = {
  studentId: number;
  fullName: string;
  branchName: string | null;
  debt: number;
};

export type RevenueRow = { paidAt: Date | null; amount: Prisma.Decimal };

const ZERO = new Prisma.Decimal(0);
const pairKey = (studentId: number, groupId: number) =>
  `${studentId}:${groupId}`;

/**
 * Qarz har bir a'zolik uchun alohida hisoblanadi va 0 ga qisiladi: bir
 * guruhdagi ortiqcha to'lov boshqa guruhning qarzini yopmaydi.
 */
export function computeDebts(
  memberships: MembershipRow[],
  paid: PaidRow[],
  queueSize = 3,
): { totalDebt: number; debtorCount: number; debtQueue: DebtQueueItem[] } {
  const paidByPair = new Map<string, Prisma.Decimal>();
  for (const row of paid) {
    paidByPair.set(pairKey(row.studentId, row.groupId), row.paid ?? ZERO);
  }

  const byStudent = new Map<
    number,
    { fullName: string; branchName: string | null; debt: Prisma.Decimal }
  >();

  for (const row of memberships) {
    const alreadyPaid =
      paidByPair.get(pairKey(row.studentId, row.groupId)) ?? ZERO;
    const debt = Prisma.Decimal.max(row.price.minus(alreadyPaid), ZERO);

    const current = byStudent.get(row.studentId);
    if (current) {
      current.debt = current.debt.plus(debt);
    } else {
      byStudent.set(row.studentId, {
        fullName: row.fullName,
        branchName: row.branchName,
        debt,
      });
    }
  }

  let total = ZERO;
  const debtors: (DebtQueueItem & { exact: Prisma.Decimal })[] = [];

  for (const [studentId, entry] of byStudent) {
    if (!entry.debt.greaterThan(ZERO)) continue;

    total = total.plus(entry.debt);
    debtors.push({
      studentId,
      fullName: entry.fullName,
      branchName: entry.branchName,
      debt: entry.debt.toNumber(),
      exact: entry.debt,
    });
  }

  debtors.sort(
    (a, b) => b.exact.comparedTo(a.exact) || a.studentId - b.studentId,
  );

  return {
    totalDebt: total.toNumber(),
    debtorCount: debtors.length,
    debtQueue: debtors
      .slice(0, queueSize)
      .map(({ studentId, fullName, branchName, debt }) => ({
        studentId,
        fullName,
        branchName,
        debt,
      })),
  };
}

/**
 * Tushumni Toshkent kuni yoki haftasi (dushanbadan) bo'yicha guruhlaydi.
 * Tushumi yo'q davr ro'yxatga kirmaydi.
 */
export function bucketRevenue(
  rows: RevenueRow[],
  granularity: 'day' | 'week',
): { bucket: string; amount: number }[] {
  const totals = new Map<string, Prisma.Decimal>();

  for (const row of rows) {
    if (!row.paidAt) continue;

    const dayKey = tashkentDateKey(row.paidAt);
    const bucket = granularity === 'week' ? weekStartKey(dayKey) : dayKey;
    totals.set(bucket, (totals.get(bucket) ?? ZERO).plus(row.amount));
  }

  return [...totals.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([bucket, amount]) => ({ bucket, amount: amount.toNumber() }));
}
