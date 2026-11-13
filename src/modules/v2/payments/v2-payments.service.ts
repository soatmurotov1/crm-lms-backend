import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CourseType, PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import {
  addDays,
  monthStartKey,
  tashkentDateKey,
  tashkentDayStart,
} from 'src/common/utils/tashkent-time.util';
import type { V2Actor } from '../common/v2-auth.guard';
import { V2AuditService, diff } from '../common/v2-audit.service';
import { debtorsOf, summarizeBalances, type StudentBalance } from '../common/v2-balance';
import {
  V2BalanceService,
  studentCourseTypeWhere,
} from '../common/v2-balance.service';
import { V2LedgerService } from '../common/v2-ledger.service';
import { pageOf, paginated } from '../common/v2-pagination';
import { V2ScopeService, type OrgWhere } from '../common/v2-scope.service';
import { dayRange, digitsOf, paidPaymentsWhere } from '../common/v2-where';
import {
  fromV2CourseType,
  fromV2PaymentMethod,
  optionalId,
  parseId,
  toId,
  toV2CourseType,
  toV2PaymentMethod,
} from '../common/v2.mapper';
import type {
  V2CreatePaymentDto,
  V2PaymentSnapshotQueryDto,
  V2PaymentsQueryDto,
  V2UpdatePaymentDto,
} from './v2-payments.dto';

const PAYMENT_SELECT = {
  id: true,
  studentId: true,
  amount: true,
  method: true,
  paidAt: true,
  created_at: true,
  branchId: true,
  recordedByName: true,
  student: {
    select: {
      fullName: true,
      firstName: true,
      lastName: true,
      branchId: true,
      organizationId: true,
      branch: { select: { name: true } },
    },
  },
  group: { select: { branchId: true, branch: { select: { name: true } } } },
  _count: { select: { paymeTransactions: true } },
} satisfies Prisma.PaymentSelect;

type PaymentRow = Prisma.PaymentGetPayload<{ select: typeof PAYMENT_SELECT }>;

@Injectable()
export class V2PaymentsService {
  constructor(
    private prisma: PrismaService,
    private scope: V2ScopeService,
    private balances: V2BalanceService,
    private ledger: V2LedgerService,
    private audit: V2AuditService,
  ) {}

  async list(
    user: RequestUser,
    actor: V2Actor,
    query: V2PaymentsQueryDto,
    headerBranchId: number | null,
  ) {
    const { page, limit, skip } = pageOf(query);
    const resolved = await this.resolve(user, actor, query, headerBranchId);
    if (!resolved) return paginated([], 0, page, limit);

    const { where } = resolved;
    const order = query.sort_order ?? 'desc';

    if (query.sort_by === 'remaining_debt') {
      const all = await this.prisma.payment.findMany({
        where,
        select: { id: true, studentId: true, paidAt: true },
      });
      const debts = await this.balances.forStudents([
        ...new Set(all.map((row) => row.studentId)),
      ]);
      const debtOf = (id: number) => debts.get(id)?.debt.toNumber() ?? 0;
      const sign = order === 'asc' ? 1 : -1;
      const ids = all
        .sort(
          (a, b) =>
            sign * (debtOf(a.studentId) - debtOf(b.studentId)) || b.id - a.id,
        )
        .slice(skip, skip + limit)
        .map((row) => row.id);
      const rows = await this.prisma.payment.findMany({
        where: { id: { in: ids } },
        select: PAYMENT_SELECT,
      });
      const byId = new Map(rows.map((row) => [row.id, row]));

      return paginated(
        await this.toPayments(ids.flatMap((id) => byId.get(id) ?? [])),
        all.length,
        page,
        limit,
      );
    }

    const orderBy: Prisma.PaymentOrderByWithRelationInput[] =
      query.sort_by === 'amount_paid'
        ? [{ amount: order }]
        : query.sort_by === 'student_name'
          ? [{ student: { fullName: order } }]
          : [{ paidAt: order }];

    const [total, rows] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        select: PAYMENT_SELECT,
        orderBy: [...orderBy, { id: 'desc' }],
        skip,
        take: limit,
      }),
    ]);

    return paginated(await this.toPayments(rows), total, page, limit);
  }

  /** Filtrlangan to'lovlar yig'indisi va shu o'quvchilarning joriy qarzi. */
  async summary(
    user: RequestUser,
    actor: V2Actor,
    query: V2PaymentsQueryDto,
    headerBranchId: number | null,
  ) {
    const resolved = await this.resolve(user, actor, query, headerBranchId);
    if (!resolved) {
      return {
        data: { period_collected: 0, period_payments_count: 0, period_debt: 0 },
      };
    }

    const [aggregate, students] = await Promise.all([
      this.prisma.payment.aggregate({
        where: resolved.where,
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.balances.load(resolved.studentScope),
    ]);

    return {
      data: {
        period_collected: aggregate._sum.amount?.toNumber() ?? 0,
        period_payments_count: aggregate._count._all,
        period_debt: summarizeBalances(students.balances).debt.toNumber(),
      },
    };
  }

  async snapshot(
    user: RequestUser,
    actor: V2Actor,
    query: V2PaymentSnapshotQueryDto,
    headerBranchId: number | null,
    now: Date = new Date(),
  ) {
    const { org, branchId } = await this.scope.read(
      user,
      actor,
      headerBranchId,
      query.branch_id,
    );
    if (!org) {
      return {
        data: {
          today_income: 0,
          this_month_income: 0,
          current_total_debt: 0,
          students_with_debt: 0,
        },
      };
    }

    const todayKey = tashkentDateKey(now);
    const paidWhere = paidPaymentsWhere(org, branchId);
    const [today, month, { balances }] = await Promise.all([
      this.prisma.payment.aggregate({
        where: {
          AND: [
            paidWhere,
            {
              paidAt: {
                gte: tashkentDayStart(todayKey),
                lt: tashkentDayStart(addDays(todayKey, 1)),
              },
            },
          ],
        },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          AND: [
            paidWhere,
            { paidAt: { gte: tashkentDayStart(monthStartKey(todayKey)) } },
          ],
        },
        _sum: { amount: true },
      }),
      this.balances.load({ ...org, ...(branchId ? { branchId } : {}) }),
    ]);

    return {
      data: {
        today_income: today._sum.amount?.toNumber() ?? 0,
        this_month_income: month._sum.amount?.toNumber() ?? 0,
        current_total_debt: summarizeBalances(balances).debt.toNumber(),
        students_with_debt: debtorsOf(balances).length,
      },
    };
  }

  async create(user: RequestUser, actor: V2Actor, payload: V2CreatePaymentDto) {
    const studentId = parseId(payload.student_id, 'O‘quvchi');
    const student = await this.ownedStudent(user, studentId);

    const { payment, replayed } = await this.ledger.record(actor, {
      studentId,
      amount: payload.amount,
      method: fromV2PaymentMethod(payload.payment_method) ?? PaymentMethod.CASH,
      idempotencyKey: payload.idempotency_key ?? null,
    });

    if (!replayed) {
      await this.audit.record(actor, 'CREATE', 'payment', payment.id, {
        organizationId: student.organizationId,
        branchId: student.branchId,
        changes: {
          student_id: toId(studentId),
          amount: payload.amount,
          payment_method: payload.payment_method,
        },
      });
    }

    return { data: await this.one(payment.id) };
  }

  async update(
    user: RequestUser,
    actor: V2Actor,
    id: number,
    payload: V2UpdatePaymentDto,
  ) {
    const before = await this.findOwned(user, id);
    if (before._count.paymeTransactions) {
      throw new BadRequestException(
        'Payme orqali qabul qilingan to‘lovni tahrirlab bo‘lmaydi',
      );
    }

    const method = fromV2PaymentMethod(payload.payment_method);
    await this.prisma.payment.update({
      where: { id },
      data: {
        ...(payload.amount !== undefined ? { amount: payload.amount } : {}),
        ...(method ? { method } : {}),
      },
    });

    const after = await this.one(id);
    const [beforeView] = await this.toPayments([before]);
    await this.audit.record(actor, 'UPDATE', 'payment', id, {
      organizationId: before.student.organizationId,
      branchId: before.branchId ?? before.student.branchId,
      changes: diff(beforeView, after),
    });

    return { data: after };
  }

  async remove(user: RequestUser, actor: V2Actor, id: number): Promise<void> {
    const row = await this.findOwned(user, id);
    if (row._count.paymeTransactions) {
      throw new BadRequestException(
        'Payme orqali qabul qilingan to‘lovni o‘chirib bo‘lmaydi',
      );
    }

    await this.prisma.payment.delete({ where: { id } });
    await this.audit.record(actor, 'DELETE', 'payment', id, {
      organizationId: row.student.organizationId,
      branchId: row.branchId ?? row.student.branchId,
      changes: {
        student_id: toId(row.studentId),
        amount: row.amount.toNumber(),
      },
    });
  }

  /**
   * Ro'yxat va yig'indi uchun umumiy shart. `studentScope` — to'lov
   * filtrlarining o'quvchiga tegishli qismi (qarz hisobi uchun).
   */
  private async resolve(
    user: RequestUser,
    actor: V2Actor,
    query: V2PaymentsQueryDto,
    headerBranchId: number | null,
  ): Promise<{
    where: Prisma.PaymentWhereInput;
    studentScope: Prisma.StudentWhereInput;
  } | null> {
    const { org, branchId } = await this.scope.read(
      user,
      actor,
      headerBranchId,
      query.branch_id ?? query.branchId,
    );
    if (!org) return null;

    const studentScope = await this.studentScope(org, branchId, query);
    const range = dayRange(
      query.start_date ?? query.startDate,
      query.end_date ?? query.endDate,
    );
    const method = fromV2PaymentMethod(
      query.payment_method ?? query.payment_type,
    );

    return {
      studentScope,
      where: paidPaymentsWhere(org, branchId, {
        student: studentScope,
        ...(range ? { paidAt: range } : {}),
        ...(method ? { method } : {}),
      }),
    };
  }

  private async studentScope(
    org: OrgWhere,
    branchId: number | null,
    query: V2PaymentsQueryDto,
  ): Promise<Prisma.StudentWhereInput> {
    const and: Prisma.StudentWhereInput[] = [];
    const courseType = fromV2CourseType(query.course_type);
    if (courseType) and.push(studentCourseTypeWhere(courseType));

    const studentId = optionalId(query.student_id);
    if (studentId !== undefined) and.push({ id: studentId ?? -1 });

    if (query.search) {
      const contains = { contains: query.search, mode: 'insensitive' as const };
      const digits = digitsOf(query.search);
      and.push({
        OR: [
          { fullName: contains },
          ...(/^\d{3,}$/.test(digits) ? [{ phone: { contains: digits } }] : []),
        ],
      });
    }

    const status =
      query.payment_status ??
      (query.paymentStatus === 'true'
        ? 'paid'
        : query.paymentStatus === 'false'
          ? 'unpaid'
          : (query.paymentStatus as 'paid' | 'unpaid' | undefined));

    const base: Prisma.StudentWhereInput = {
      ...org,
      ...(branchId ? { branchId } : {}),
      AND: and,
    };

    if (!status) return base;

    // Holat — hisoblanadigan qiymat: mos o'quvchilar id ro'yxati bilan.
    const { balances } = await this.balances.load(base);
    const ids = balances
      .filter((balance: StudentBalance) =>
        status === 'unpaid'
          ? balance.debt.greaterThan(0)
          : !balance.debt.greaterThan(0),
      )
      .map((balance) => balance.studentId);

    return { ...base, id: { in: ids } };
  }

  private async ownedStudent(user: RequestUser, id: number) {
    const org = this.scope.org(user);
    const student = org
      ? await this.prisma.student.findFirst({
          where: { id, ...org, deleted_at: null },
          select: { id: true, organizationId: true, branchId: true },
        })
      : null;
    if (!student) throw new NotFoundException('O‘quvchi topilmadi');
    return student;
  }

  private async findOwned(user: RequestUser, id: number): Promise<PaymentRow> {
    const org = this.scope.org(user);
    const row = org
      ? await this.prisma.payment.findFirst({
          where: { id, student: { ...org } },
          select: PAYMENT_SELECT,
        })
      : null;
    if (!row) throw new NotFoundException('To‘lov topilmadi');
    return row;
  }

  private async one(id: number) {
    const row = await this.prisma.payment.findUnique({
      where: { id },
      select: PAYMENT_SELECT,
    });
    if (!row) throw new NotFoundException('To‘lov topilmadi');
    const [payment] = await this.toPayments([row]);
    return payment;
  }

  private async toPayments(rows: PaymentRow[]) {
    const balances = await this.balances.forStudents([
      ...new Set(rows.map((row) => row.studentId)),
    ]);

    return rows.map((row) => {
      const balance = balances.get(row.studentId);
      const branchId =
        row.branchId ?? row.group?.branchId ?? row.student.branchId;
      const branchName =
        row.group?.branch?.name ?? row.student.branch?.name ?? '';
      const date = row.paidAt ?? row.created_at;

      return {
        id: toId(row.id),
        student_id: toId(row.studentId),
        student_name: row.student.fullName,
        branch_id: branchId ? toId(branchId) : '',
        branch_name: branchName,
        course_type: toV2CourseType(
          balance?.courseType ?? CourseType.OFFLINE,
        ),
        total_price: balance?.totalPrice.toNumber() ?? 0,
        amount_paid: row.amount.toNumber(),
        remaining_debt: balance?.debt.toNumber() ?? 0,
        payment_method: toV2PaymentMethod(row.method) ?? 'naqd',
        recorded_by: row.recordedByName,
        date: date.toISOString(),
        created_at: row.created_at.toISOString(),
      };
    });
  }
}

