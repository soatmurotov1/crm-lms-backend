import { CourseType, Prisma } from '@prisma/client';

/** Hisob uchun o'quvchi ma'lumoti. */
export type BalanceStudent = {
  studentId: number;
  fullName: string;
  branchId: number | null;
  branchName: string | null;
  courseType: CourseType;
  /** O'quvchi bilan kelishilgan narx (`Student.totalPrice`). */
  ownPrice: Prisma.Decimal | null;
  /** Faol guruhlaridagi kurs narxlari — narx kelishilmagan eski yozuvlar uchun. */
  groupPrices: Prisma.Decimal[];
  /** Ro'yxatdan o'tgan sana — qarz "yoshi" shundan sanaladi. */
  since: Date;
};

export type BalancePaidRow = {
  studentId: number;
  paid: Prisma.Decimal | null;
};

/** Bitta o'quvchining joriy hisobi. */
export type StudentBalance = {
  studentId: number;
  fullName: string;
  branchId: number | null;
  branchName: string | null;
  courseType: CourseType;
  totalPrice: Prisma.Decimal;
  /** Haqiqatda to'langan summa (ortiqcha to'lov ham shu yerda). */
  paid: Prisma.Decimal;
  /** Narx − to'langan. Manfiy bo'lsa — o'quvchining haqi (avans). */
  debt: Prisma.Decimal;
  since: Date;
};

const ZERO = new Prisma.Decimal(0);

/** Narx: kelishilgan narx, u bo'lmasa — faol guruhlar kurs narxlari yig'indisi. */
export const priceOf = (
  ownPrice: Prisma.Decimal | null,
  groupPrices: Prisma.Decimal[],
): Prisma.Decimal =>
  ownPrice ?? groupPrices.reduce((total, price) => total.plus(price), ZERO);

/**
 * Har bir o'quvchi uchun narx, to'langan va qarz.
 *
 * Frontendda qarz yagona yuguruvchi qoldiq: u manfiy ham bo'lishi mumkin
 * (o'quvchi oldindan to'lagan). Shuning uchun to'lov guruhga bog'lanmaydi —
 * o'quvchining hamma to'lovi bitta hisobga tushadi.
 */
export function computeBalances(
  students: BalanceStudent[],
  paidRows: BalancePaidRow[],
): StudentBalance[] {
  const paidByStudent = new Map<number, Prisma.Decimal>();
  for (const row of paidRows) {
    paidByStudent.set(
      row.studentId,
      (paidByStudent.get(row.studentId) ?? ZERO).plus(row.paid ?? ZERO),
    );
  }

  return students.map((student) => {
    const totalPrice = priceOf(student.ownPrice, student.groupPrices);
    const paid = paidByStudent.get(student.studentId) ?? ZERO;

    return {
      studentId: student.studentId,
      fullName: student.fullName,
      branchId: student.branchId,
      branchName: student.branchName,
      courseType: student.courseType,
      totalPrice,
      paid,
      debt: totalPrice.minus(paid),
      since: student.since,
    };
  });
}

export type BalanceTotals = {
  students: number;
  totalPrice: Prisma.Decimal;
  /** Narxdan oshmaydigan qismi: ortiqcha to'lov yig'im foiziga kirmaydi. */
  paid: Prisma.Decimal;
  /** Faqat musbat qarzlar yig'indisi. */
  debt: Prisma.Decimal;
  /** To'liq to'lagan / qisman to'lagan / hech narsa to'lamaganlar soni. */
  fullyPaid: number;
  partial: number;
  unpaid: number;
};

export function summarizeBalances(balances: StudentBalance[]): BalanceTotals {
  const totals: BalanceTotals = {
    students: balances.length,
    totalPrice: ZERO,
    paid: ZERO,
    debt: ZERO,
    fullyPaid: 0,
    partial: 0,
    unpaid: 0,
  };

  for (const balance of balances) {
    totals.totalPrice = totals.totalPrice.plus(balance.totalPrice);
    totals.paid = totals.paid.plus(
      Prisma.Decimal.max(
        Prisma.Decimal.min(balance.paid, balance.totalPrice),
        ZERO,
      ),
    );

    if (!balance.debt.greaterThan(ZERO)) {
      totals.fullyPaid += 1;
      continue;
    }

    totals.debt = totals.debt.plus(balance.debt);
    if (balance.paid.greaterThan(ZERO)) totals.partial += 1;
    else totals.unpaid += 1;
  }

  return totals;
}

/** Qarzdorlar, eng kattasidan boshlab. Teng bo'lsa — id bo'yicha, barqaror. */
export function debtorsOf(balances: StudentBalance[]): StudentBalance[] {
  return balances
    .filter((balance) => balance.debt.greaterThan(ZERO))
    .sort((a, b) => b.debt.comparedTo(a.debt) || a.studentId - b.studentId);
}
