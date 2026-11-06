import { addDays, tashkentDayStart } from 'src/common/utils/tashkent-time.util';
import { ExpenseStatus, PaymentStatus, Prisma } from '@prisma/client';
import type { OrgWhere } from './v2-scope.service';

/**
 * Qabul qilingan to'lovlar sharti.
 *
 * Tashkilot o'quvchi orqali aniqlanadi. Filial: yangi to'lovlarda
 * `Payment.branchId` yoziladi, eski (guruhga bog'langan) to'lovlarda esa
 * guruhning filiali olinadi.
 */
export function paidPaymentsWhere(
  org: OrgWhere,
  branchId: number | null,
  extra: Prisma.PaymentWhereInput = {},
): Prisma.PaymentWhereInput {
  return {
    AND: [
      { status: PaymentStatus.PAID, student: { ...org } },
      ...(branchId ? [paymentBranchWhere(branchId)] : []),
      extra,
    ],
  };
}

export function paymentBranchWhere(branchId: number): Prisma.PaymentWhereInput {
  return {
    OR: [{ branchId }, { branchId: null, group: { branchId } }],
  };
}

/** O'chirilmagan, bekor qilinmagan xarajatlar. */
export function liveExpensesWhere(
  org: OrgWhere,
  branchId: number | null,
): Prisma.ExpenseWhereInput {
  return {
    ...org,
    deleted_at: null,
    ...(branchId ? { branchId } : {}),
  };
}

/** To'lanishi kutilayotgan xarajatlar (rejalashtirilgan yoki qisman). */
export const OPEN_EXPENSE_STATUSES = [
  ExpenseStatus.PENDING,
  ExpenseStatus.PARTIALLY_PAID,
];

/**
 * `YYYY-MM-DD` oralig'i (ikkala chekka ham kiradi) — Toshkent kunlari bo'yicha.
 * Ikkalasi ham bo'sh bo'lsa `undefined`.
 */
export function dayRange(
  from?: string | null,
  to?: string | null,
): { gte?: Date; lt?: Date } | undefined {
  if (!from && !to) return undefined;

  return {
    ...(from ? { gte: tashkentDayStart(from) } : {}),
    ...(to ? { lt: tashkentDayStart(addDays(to, 1)) } : {}),
  };
}

/** `YYYY-MM-DD` → shu kunning Toshkent yarim tuni (sana maydonlari uchun). */
export const dateFromKey = (key: string): Date => tashkentDayStart(key);

/** Telefon qidiruvi uchun raqamlar ("+998 90 123-45-67" → "998901234567"). */
export const digitsOf = (value: string) => value.replace(/[\s()+-]/g, '');
