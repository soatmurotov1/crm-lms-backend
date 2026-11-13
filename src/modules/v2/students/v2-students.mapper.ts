import { Injectable } from '@nestjs/common';
import { PaymentStatus, Prisma, Status } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import type { V2Actor } from '../common/v2-auth.guard';
import { courseTypeOf, V2BalanceService } from '../common/v2-balance.service';
import type { StudentBalance } from '../common/v2-balance';
import {
  dateKey,
  splitName,
  toId,
  toV2CourseType,
  toV2PaymentMethod,
} from '../common/v2.mapper';

export const STUDENT_SELECT = {
  id: true,
  fullName: true,
  firstName: true,
  lastName: true,
  middleName: true,
  phone: true,
  email: true,
  passportSeries: true,
  passportNumber: true,
  birth_date: true,
  gender: true,
  address: true,
  courseType: true,
  courseId: true,
  totalPrice: true,
  paymentMethod: true,
  lifecycle: true,
  result: true,
  hasDocument: true,
  contractNumber: true,
  notes: true,
  startDate: true,
  completionDate: true,
  leadSource: true,
  leadSourceOther: true,
  referredByStudentId: true,
  referredByUserId: true,
  registeredById: true,
  hasLearnerAccount: true,
  branchId: true,
  organizationId: true,
  deleted_at: true,
  created_at: true,
  branch: { select: { name: true } },
  course: { select: { name: true, type: true } },
  studentGroups: {
    where: { status: Status.ACTIVE, group: { status: Status.ACTIVE } },
    select: {
      group: {
        select: {
          id: true,
          name: true,
          courseType: true,
          course: { select: { type: true } },
        },
      },
    },
    orderBy: { created_at: 'asc' },
  },
  payments: {
    where: { status: PaymentStatus.PAID },
    select: { amount: true },
    orderBy: [{ paidAt: 'asc' }, { id: 'asc' }],
    take: 3,
  },
} satisfies Prisma.StudentSelect;

export type StudentRow = Prisma.StudentGetPayload<{
  select: typeof STUDENT_SELECT;
}>;

/** Frontenddagi `Student` (features/students/types.ts). */
export type V2Student = ReturnType<V2StudentMapper['map']>;

/**
 * O'quvchini frontend ko'rinishiga keltiradi. Guruh kartochkasi va
 * to'lovlar ham shu shaklni ishlatadi.
 */
@Injectable()
export class V2StudentMapper {
  constructor(
    private prisma: PrismaService,
    private balances: V2BalanceService,
  ) {}

  async many(rows: StudentRow[], actor: V2Actor) {
    const ids = rows.map((row) => row.id);
    const operatorIds = [
      ...new Set(
        rows.flatMap((row) => (row.registeredById ? [row.registeredById] : [])),
      ),
    ];

    const [balances, operators] = await Promise.all([
      this.balances.forStudents(ids),
      operatorIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: operatorIds } },
            select: { id: true, fullName: true },
          })
        : Promise.resolve([] as { id: number; fullName: string }[]),
    ]);
    const names = new Map<number, string>(
      operators.map((row) => [row.id, row.fullName]),
    );

    return rows.map((row) =>
      this.map(row, balances.get(row.id), actor, names),
    );
  }

  async one(row: StudentRow, actor: V2Actor) {
    const [student] = await this.many([row], actor);
    return student;
  }

  map(
    row: StudentRow,
    balance: StudentBalance | undefined,
    actor: V2Actor,
    operatorNames: Map<number, string>,
  ) {
    const fallback = splitName(row.fullName);
    const group = row.studentGroups[0]?.group;
    const courseType = toV2CourseType(courseTypeOf(row));
    const debt = balance?.debt.toNumber() ?? 0;
    const paid = balance?.paid.toNumber() ?? 0;
    // O'qituvchi pul summalarini ko'rmaydi — faqat "qarzi bor/yo'q".
    const financeHidden = actor.role === 'teacher';
    const [first, second, third] = row.payments.map((payment) =>
      payment.amount.toNumber(),
    );

    return {
      id: toId(row.id),
      first_name: row.firstName ?? fallback.first,
      last_name: row.lastName ?? fallback.last,
      ...(row.middleName ? { middle_name: row.middleName } : {}),
      phone: row.phone,
      ...(row.email ? { email: row.email } : {}),
      ...(row.passportSeries ? { passport_series: row.passportSeries } : {}),
      ...(row.passportNumber ? { passport_number: row.passportNumber } : {}),
      ...(row.birth_date ? { birth_date: dateKey(row.birth_date) } : {}),
      ...(row.gender ? { gender: row.gender as 'male' | 'female' } : {}),
      ...(row.address ? { address: row.address } : {}),
      ...(financeHidden
        ? { has_debt: debt > 0 }
        : {
            total_price: balance?.totalPrice.toNumber() ?? 0,
            debt,
            amount_paid: paid,
            ...(first !== undefined ? { initial_payment: first } : {}),
            ...(second !== undefined ? { second_payment: second } : {}),
            ...(third !== undefined ? { third_payment: third } : {}),
          }),
      course_type: courseType,
      ...(row.courseId ? { course_id: toId(row.courseId) } : {}),
      ...(row.course ? { course_name: row.course.name } : {}),
      branch_id: row.branchId ? toId(row.branchId) : '',
      ...(row.branch ? { branch_name: row.branch.name } : {}),
      payment_method: toV2PaymentMethod(row.paymentMethod),
      has_document: row.hasDocument,
      ...(row.registeredById
        ? {
            registered_by_id: toId(row.registeredById),
            registered_by: operatorNames.get(row.registeredById) ?? '',
          }
        : {}),
      result: row.result as 'oqimoqda' | 'topshirdi' | 'yiqildi',
      ...(row.notes ? { notes: row.notes } : {}),
      created_at: row.created_at.toISOString(),
      status: row.lifecycle as 'active' | 'completed' | 'dropped' | 'suspended',
      deleted_at: row.deleted_at?.toISOString() ?? null,
      ...(group ? { group_id: toId(group.id), group_name: group.name } : {}),
      ...(row.completionDate
        ? { completion_date: dateKey(row.completionDate) }
        : {}),
      ...(row.contractNumber ? { contract_number: row.contractNumber } : {}),
      ...(row.startDate ? { start_date: dateKey(row.startDate) } : {}),
      ...(row.leadSource ? { lead_source: row.leadSource } : {}),
      ...(row.leadSourceOther
        ? { lead_source_other: row.leadSourceOther }
        : {}),
      ...(row.referredByStudentId
        ? { referred_by_student_id: toId(row.referredByStudentId) }
        : {}),
      ...(row.referredByUserId
        ? { referred_by_user_id: row.referredByUserId }
        : {}),
      has_learner_account: row.hasLearnerAccount,
    };
  }
}
