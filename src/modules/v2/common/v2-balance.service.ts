import { Injectable } from '@nestjs/common';
import {
  CourseType,
  PaymentStatus,
  Prisma,
  Status,
} from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { computeBalances, type StudentBalance } from './v2-balance';

/** Hisob uchun kerakli o'quvchi maydonlari. */
export const BALANCE_STUDENT_SELECT = {
  id: true,
  fullName: true,
  branchId: true,
  courseType: true,
  totalPrice: true,
  created_at: true,
  branch: { select: { name: true } },
  course: { select: { type: true, price: true } },
  studentGroups: {
    where: { status: Status.ACTIVE, group: { status: Status.ACTIVE } },
    select: {
      group: {
        select: {
          courseType: true,
          course: { select: { price: true, type: true } },
        },
      },
    },
    orderBy: { created_at: 'asc' },
  },
} satisfies Prisma.StudentSelect;

type BalanceStudentRow = Prisma.StudentGetPayload<{
  select: typeof BALANCE_STUDENT_SELECT;
}>;

/**
 * O'quvchining kurs turi: o'zida yozilgani → kursi → birinchi guruhi.
 * Eski panelda yaratilgan o'quvchida faqat guruh bo'ladi.
 */
export function courseTypeOf(row: {
  courseType: CourseType | null;
  course?: { type: CourseType } | null;
  studentGroups?: {
    group: { courseType: CourseType; course?: { type: CourseType } | null };
  }[];
}): CourseType {
  const group = row.studentGroups?.[0]?.group;

  return (
    row.courseType ??
    row.course?.type ??
    group?.course?.type ??
    group?.courseType ??
    CourseType.OFFLINE
  );
}

/** Kurs turi bo'yicha o'quvchi sharti (o'zida yoki guruhi orqali). */
export function studentCourseTypeWhere(
  type: CourseType,
): Prisma.StudentWhereInput {
  return {
    OR: [
      { courseType: type },
      {
        courseType: null,
        studentGroups: {
          some: {
            status: Status.ACTIVE,
            group: { OR: [{ courseType: type }, { course: { type } }] },
          },
        },
      },
    ],
  };
}

@Injectable()
export class V2BalanceService {
  constructor(private prisma: PrismaService) {}

  /**
   * Berilgan shartdagi o'quvchilarning joriy hisobi.
   *
   * Qarz — joriy holat: sana oralig'i qo'llanmaydi. O'chirilgan o'quvchi
   * hisobga kirmaydi.
   */
  async load(studentWhere: Prisma.StudentWhereInput): Promise<{
    balances: StudentBalance[];
    /** O'quvchining oxirgi to'lovi. */
    lastPaymentAt: Map<number, Date>;
  }> {
    const students = await this.prisma.student.findMany({
      // Chaqiruvchi `deleted_at` ni o'zi bersa (o'chirilganlar ro'yxati) — ustun.
      where: { deleted_at: null, ...studentWhere },
      select: BALANCE_STUDENT_SELECT,
    });

    return this.compute(students);
  }

  /** Aniq o'quvchilar hisobi (ro'yxat sahifasi uchun). */
  async forStudents(ids: number[]): Promise<Map<number, StudentBalance>> {
    if (!ids.length) return new Map();

    const students = await this.prisma.student.findMany({
      where: { id: { in: ids } },
      select: BALANCE_STUDENT_SELECT,
    });
    const { balances } = await this.compute(students);

    return new Map(balances.map((balance) => [balance.studentId, balance]));
  }

  private async compute(students: BalanceStudentRow[]) {
    const ids = students.map((student) => student.id);
    const paidWhere: Prisma.PaymentWhereInput = {
      status: PaymentStatus.PAID,
      studentId: { in: ids },
    };

    const [paidRows, lastRows] = ids.length
      ? await Promise.all([
          this.prisma.payment.groupBy({
            by: ['studentId'],
            where: paidWhere,
            _sum: { amount: true },
          }),
          this.prisma.payment.groupBy({
            by: ['studentId'],
            where: paidWhere,
            _max: { paidAt: true },
          }),
        ])
      : [[], []];

    const lastPaymentAt = new Map<number, Date>();
    for (const row of lastRows) {
      if (row._max.paidAt) lastPaymentAt.set(row.studentId, row._max.paidAt);
    }

    return {
      balances: computeBalances(
        students.map((row) => ({
          studentId: row.id,
          fullName: row.fullName,
          branchId: row.branchId,
          branchName: row.branch?.name ?? null,
          courseType: courseTypeOf(row),
          ownPrice: row.totalPrice ?? row.course?.price ?? null,
          groupPrices: row.studentGroups.flatMap((membership) =>
            membership.group.course ? [membership.group.course.price] : [],
          ),
          since: row.created_at,
        })),
        paidRows.map((row) => ({
          studentId: row.studentId,
          paid: row._sum.amount,
        })),
      ),
      lastPaymentAt,
    };
  }
}
