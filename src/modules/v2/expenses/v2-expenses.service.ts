import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ExpenseStatus,
  Prisma,
  Status,
  UserStatus,
  type Expense,
  type ExpenseEvent,
  type ExpensePayment,
} from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import {
  addDays,
  daysBetween,
  tashkentDateKey,
  tashkentDayStart,
} from 'src/common/utils/tashkent-time.util';
import { CROSS_BRANCH_ROLES, type V2Actor } from '../common/v2-auth.guard';
import { V2AuditService } from '../common/v2-audit.service';
import { ConcurrentUpdateException, isUniqueViolation } from '../common/v2-errors';
import { pageOf, paginated } from '../common/v2-pagination';
import { V2ScopeService, type OrgWhere } from '../common/v2-scope.service';
import { OPEN_EXPENSE_STATUSES, dayRange } from '../common/v2-where';
import {
  dateKey,
  fromV2PaymentMethod,
  iso,
  optionalId,
  parseStaffId,
  toId,
  toTeacherId,
  toV2PaymentMethod,
} from '../common/v2.mapper';
import type {
  V2CreateExpenseDto,
  V2CreateExpensePaymentDto,
  V2CreateTeacherSettlementDto,
  V2DeletedExpensesQueryDto,
  V2ExpenseLifecycleDto,
  V2ExpenseMonthCloseQueryDto,
  V2ExpenseStatus,
  V2ExpenseTriageQueryDto,
  V2ExpensesQueryDto,
  V2UpdateExpenseDto,
} from './v2-expenses.dto';

type Tx = Prisma.TransactionClient;

const ZERO = new Prisma.Decimal(0);

const STATUS_TO_V2: Record<ExpenseStatus, V2ExpenseStatus> = {
  [ExpenseStatus.PENDING]: 'planned',
  [ExpenseStatus.PARTIALLY_PAID]: 'partially_paid',
  [ExpenseStatus.PAID]: 'paid',
  [ExpenseStatus.CANCELLED]: 'cancelled',
};

const STATUS_FROM_V2: Record<V2ExpenseStatus, ExpenseStatus> = {
  planned: ExpenseStatus.PENDING,
  partially_paid: ExpenseStatus.PARTIALLY_PAID,
  paid: ExpenseStatus.PAID,
  cancelled: ExpenseStatus.CANCELLED,
};

const EXPENSE_INCLUDE = {
  payments: { select: { id: true }, take: 1 },
} satisfies Prisma.ExpenseInclude;

type ExpenseRow = Expense & { payments?: { id: number }[] };

/** Pul qiymati frontend kutgan ko'rinishda: `"1500000.00"`. */
const moneyString = (value: Prisma.Decimal | number | string | null | undefined) =>
  new Prisma.Decimal(value ?? 0).toFixed(2);

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Qoldiqqa qarab holat: to'liq to'langan, qisman yoki rejada. */
function statusFor(amount: Prisma.Decimal, paid: Prisma.Decimal): ExpenseStatus {
  if (paid.greaterThanOrEqualTo(amount) && amount.greaterThan(0)) {
    return ExpenseStatus.PAID;
  }
  return paid.greaterThan(0)
    ? ExpenseStatus.PARTIALLY_PAID
    : ExpenseStatus.PENDING;
}

@Injectable()
export class V2ExpensesService {
  constructor(
    private prisma: PrismaService,
    private scope: V2ScopeService,
    private audit: V2AuditService,
  ) {}

  // --- O'qish ---------------------------------------------------------------

  async list(
    user: RequestUser,
    actor: V2Actor,
    query: V2ExpensesQueryDto,
    headerBranchId: number | null,
  ) {
    const { page, limit, skip, take } = pageOf(query);
    const where = await this.listWhere(user, actor, query, headerBranchId);
    if (!where) return paginated([], 0, page, limit);

    const today = tashkentDateKey(new Date());
    const [total, rows] = await Promise.all([
      this.prisma.expense.count({ where }),
      this.prisma.expense.findMany({
        where,
        include: EXPENSE_INCLUDE,
        orderBy:
          query.attention === 'overdue'
            ? [{ dueDate: 'asc' }, { id: 'asc' }]
            : [{ expenseDate: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
    ]);

    const branches = await this.branchNames(rows.map((row) => row.branchId));
    return paginated(
      rows.map((row) => this.toExpense(row, branches, today)),
      total,
      page,
      limit,
    );
  }

  async triageCounts(
    user: RequestUser,
    actor: V2Actor,
    query: V2ExpenseTriageQueryDto,
    headerBranchId: number | null,
  ) {
    const base = await this.listWhere(
      user,
      actor,
      { branch_id: query.branch_id, scope: query.scope },
      headerBranchId,
    );
    const empty = {
      pending_total: 0,
      due_today: 0,
      due_within_three_days: 0,
      overdue_1_7: 0,
      overdue_8_30: 0,
      overdue_31_plus: 0,
      created_yesterday: 0,
    };
    if (!base) return { data: empty };

    const today = tashkentDateKey(new Date());
    const day = (offset: number) => tashkentDayStart(addDays(today, offset));
    const open: Prisma.ExpenseWhereInput = {
      AND: [base, { status: { in: OPEN_EXPENSE_STATUSES } }],
    };
    const due = (range: Prisma.DateTimeNullableFilter) =>
      this.prisma.expense.count({ where: { AND: [open, { dueDate: range }] } });

    const [
      pending,
      dueToday,
      dueSoon,
      overdue1to7,
      overdue8to30,
      overdue31,
      createdYesterday,
    ] = await Promise.all([
      this.prisma.expense.count({ where: open }),
      due({ gte: day(0), lt: day(1) }),
      due({ gte: day(1), lt: day(4) }),
      due({ gte: day(-7), lt: day(0) }),
      due({ gte: day(-30), lt: day(-7) }),
      due({ lt: day(-30) }),
      this.prisma.expense.count({
        where: { AND: [base, { created_at: { gte: day(-1), lt: day(0) } }] },
      }),
    ]);

    return {
      data: {
        pending_total: pending,
        due_today: dueToday,
        due_within_three_days: dueSoon,
        overdue_1_7: overdue1to7,
        overdue_8_30: overdue8to30,
        overdue_31_plus: overdue31,
        created_yesterday: createdYesterday,
      },
    };
  }

  async detail(user: RequestUser, actor: V2Actor, id: number) {
    const row = await this.findOwned(user, actor, id);
    const branches = await this.branchNames([row.branchId]);
    return {
      data: this.toExpense(row, branches, tashkentDateKey(new Date())),
    };
  }

  async history(user: RequestUser, actor: V2Actor, id: number) {
    const row = await this.findOwned(user, actor, id);
    const [payments, events, branches] = await Promise.all([
      this.prisma.expensePayment.findMany({
        where: { expenseId: id },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.expenseEvent.findMany({
        where: { expenseId: id },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      }),
      this.branchNames([row.branchId]),
    ]);

    return {
      data: {
        expense: this.toExpense(row, branches, tashkentDateKey(new Date())),
        payments: payments.map((payment) => this.toPayment(payment, row)),
        events: events.map((event) => this.toEvent(event)),
      },
    };
  }

  async branchOptions(user: RequestUser) {
    const org = this.scope.org(user);
    if (!org) return { data: [] };

    const rows = await this.prisma.branch.findMany({
      where: { ...org, status: Status.ACTIVE },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return { data: rows.map((row) => ({ id: toId(row.id), name: row.name })) };
  }

  async teacherOptions(user: RequestUser) {
    const org = this.scope.org(user);
    if (!org) return { data: [] };

    const rows = await this.prisma.teacher.findMany({
      where: {
        ...org,
        deleted_at: null,
        status: UserStatus.ACTIVE,
        branchId: { not: null },
      },
      select: { id: true, fullName: true, branchId: true },
      orderBy: { fullName: 'asc' },
    });
    return {
      data: rows.map((row) => ({
        id: toTeacherId(row.id),
        name: row.fullName,
        branch_id: toId(row.branchId!),
      })),
    };
  }

  async deletedHistory(
    user: RequestUser,
    actor: V2Actor,
    query: V2DeletedExpensesQueryDto,
  ) {
    const { page, limit, skip, take } = pageOf(query);
    const org = this.scope.org(user);
    if (!org) return paginated([], 0, page, limit);

    const where: Prisma.ExpenseWhereInput = {
      ...org,
      deleted_at: { not: null },
      ...this.managerBranch(actor),
      ...(query.search
        ? { title: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.expense.count({ where }),
      this.prisma.expense.findMany({
        where,
        orderBy: { deleted_at: 'desc' },
        skip,
        take,
      }),
    ]);
    const branches = await this.branchNames(rows.map((row) => row.branchId));

    return paginated(
      rows.map((row) => ({
        id: toId(row.id),
        title: row.title,
        category: row.category,
        amount: moneyString(row.amount),
        branch_id: row.branchId ? toId(row.branchId) : null,
        branch_name: row.branchId ? (branches.get(row.branchId) ?? null) : null,
        deleted_at: iso(row.deleted_at),
      })),
      total,
      page,
      limit,
    );
  }

  /** Oy yopilishi: shu oydagi xarajatlar va ularning to'lovlari (CSV). */
  async monthCloseCsv(
    user: RequestUser,
    actor: V2Actor,
    query: V2ExpenseMonthCloseQueryDto,
    headerBranchId: number | null,
  ): Promise<{ filename: string; body: string }> {
    const from = `${query.month}-01`;
    const [year, month] = query.month.split('-').map(Number);
    const next =
      month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, '0')}-01`;

    const where = await this.listWhere(
      user,
      actor,
      { branch_id: query.branch_id },
      headerBranchId,
    );
    const rows = where
      ? await this.prisma.expense.findMany({
          where: {
            AND: [
              where,
              {
                expenseDate: {
                  gte: tashkentDayStart(from),
                  lt: tashkentDayStart(next),
                },
              },
            ],
          },
          orderBy: [{ expenseDate: 'asc' }, { id: 'asc' }],
        })
      : [];
    const branches = await this.branchNames(rows.map((row) => row.branchId));

    const header = [
      'id',
      'sana',
      'filial',
      'turi',
      'nomi',
      'summa',
      'tolangan',
      'qoldiq',
      'holat',
      'muddat',
      'oluvchi',
    ];
    const lines = rows.map((row) => {
      const paid = new Prisma.Decimal(row.paidAmount);
      return [
        row.id,
        dateKey(row.expenseDate ?? row.created_at),
        row.branchId ? (branches.get(row.branchId) ?? '') : 'Markaz',
        row.category,
        row.title,
        moneyString(row.amount),
        moneyString(paid),
        moneyString(new Prisma.Decimal(row.amount).minus(paid)),
        STATUS_TO_V2[row.status],
        dateKey(row.dueDate) ?? '',
        row.payee ?? '',
      ]
        .map(csvCell)
        .join(',');
    });

    return {
      filename: `expenses-${query.month}.csv`,
      body: `﻿${[header.join(','), ...lines].join('\n')}\n`,
    };
  }

  // --- Yozish ---------------------------------------------------------------

  async create(
    user: RequestUser,
    actor: V2Actor,
    payload: V2CreateExpenseDto,
    headerBranchId: number | null,
  ) {
    const replay = await this.findByIdempotency(payload.idempotency_key);
    if (replay) return this.detail(user, actor, replay.id);

    const branchId = await this.resolveWriteBranch(
      user,
      actor,
      payload.branch_id,
      headerBranchId,
    );
    const organizationId = await this.scope.writeOrg(user, branchId);

    const row = await this.createWithEvent(actor, {
      organizationId,
      branchId,
      category: payload.category,
      title: payload.title,
      amount: new Prisma.Decimal(payload.amount),
      expenseDate: tashkentDayStart(payload.expense_date),
      dueDate: payload.due_date ? tashkentDayStart(payload.due_date) : null,
      payee: payload.payee || null,
      note: payload.note || null,
      createdById: actor.ref.kind === 'user' ? actor.ref.id : null,
      idempotencyKey: payload.idempotency_key,
    });

    return this.detail(user, actor, row.id);
  }

  async createTeacherSettlement(
    user: RequestUser,
    actor: V2Actor,
    payload: V2CreateTeacherSettlementDto,
  ) {
    const replay = await this.findByIdempotency(payload.idempotency_key);
    if (replay) return this.detail(user, actor, replay.id);

    const ref = parseStaffId(payload.teacher_id);
    const org = this.scope.org(user);
    const teacher =
      ref?.kind === 'teacher' && org
        ? await this.prisma.teacher.findFirst({
            where: { id: ref.id, ...org, deleted_at: null },
            select: { id: true, fullName: true, branchId: true, organizationId: true },
          })
        : null;
    if (!teacher) throw new NotFoundException('O‘qituvchi topilmadi');
    if (!teacher.branchId) {
      throw new BadRequestException('O‘qituvchi filialga biriktirilmagan');
    }

    const organizationId =
      teacher.organizationId ?? (await this.scope.writeOrg(user, teacher.branchId));
    const row = await this.createWithEvent(actor, {
      organizationId,
      branchId: teacher.branchId,
      category: 'teacher_settlement',
      title: payload.title,
      amount: new Prisma.Decimal(payload.amount),
      expenseDate: tashkentDayStart(tashkentDateKey(new Date())),
      dueDate: payload.due_date ? tashkentDayStart(payload.due_date) : null,
      payee: payload.payee || teacher.fullName,
      note: payload.note || null,
      teacherId: teacher.id,
      periodMonth: payload.period_month,
      createdById: actor.ref.kind === 'user' ? actor.ref.id : null,
      idempotencyKey: payload.idempotency_key,
    });

    return this.detail(user, actor, row.id);
  }

  async update(
    user: RequestUser,
    actor: V2Actor,
    id: number,
    payload: V2UpdateExpenseDto,
  ) {
    const before = await this.findOwned(user, actor, id);
    this.assertVersion(before, payload.expected_version);
    if (before.status === ExpenseStatus.CANCELLED) {
      throw new ConflictException('Bekor qilingan xarajatni tahrirlab bo‘lmaydi');
    }

    const paid = new Prisma.Decimal(before.paidAmount);
    const touchesMoney =
      payload.amount !== undefined ||
      payload.category !== undefined ||
      payload.expense_date !== undefined ||
      payload.branch_id !== undefined;
    if (touchesMoney && (paid.greaterThan(0) || before.payments?.length)) {
      throw new ConflictException(
        'To‘lov qilingan xarajatning summasi, turi, sanasi va filialini o‘zgartirib bo‘lmaydi',
      );
    }

    const data: Prisma.ExpenseUpdateInput = {};
    if (payload.title !== undefined) data.title = payload.title;
    if (payload.category !== undefined) {
      if (before.category === 'teacher_settlement') {
        throw new BadRequestException('O‘qituvchi hisob-kitobi turini o‘zgartirib bo‘lmaydi');
      }
      data.category = payload.category;
    }
    if (payload.amount !== undefined) {
      const amount = new Prisma.Decimal(payload.amount);
      if (!amount.greaterThan(0)) {
        throw new BadRequestException('Summa musbat bo‘lishi kerak');
      }
      data.amount = amount;
      data.status = statusFor(amount, paid);
    }
    if (payload.expense_date !== undefined) {
      data.expenseDate = tashkentDayStart(payload.expense_date);
    }
    if (payload.due_date !== undefined) {
      data.dueDate = payload.due_date ? tashkentDayStart(payload.due_date) : null;
    }
    if (payload.payee !== undefined) data.payee = payload.payee || null;
    if (payload.note !== undefined) data.note = payload.note || null;
    if (payload.branch_id !== undefined) {
      if (!CROSS_BRANCH_ROLES.includes(actor.role)) {
        throw new ForbiddenException('Filialni faqat markaz rahbariyati o‘zgartiradi');
      }
      data.branchId = await this.scope.optionalBranch(user, payload.branch_id);
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await this.bumpVersion(tx, before, data);
      const changes = this.changesOf(before, updated);
      await this.event(tx, actor, id, 'updated', changes);
      return updated;
    });

    await this.audit.record(actor, 'UPDATE', 'expense', id, {
      organizationId: row.organizationId,
      branchId: row.branchId,
      changes: this.changesOf(before, row),
    });

    return this.detail(user, actor, id);
  }

  async cancel(
    user: RequestUser,
    actor: V2Actor,
    id: number,
    payload: V2ExpenseLifecycleDto,
  ) {
    const before = await this.findOwned(user, actor, id);
    this.assertVersion(before, payload.expected_version);
    if (before.status === ExpenseStatus.CANCELLED) {
      throw new ConflictException('Xarajat allaqachon bekor qilingan');
    }
    if (new Prisma.Decimal(before.paidAmount).greaterThan(0)) {
      throw new ConflictException(
        'To‘lov qilingan xarajatni bekor qilib bo‘lmaydi. Avval to‘lovlarni bekor qiling',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await this.bumpVersion(tx, before, {
        status: ExpenseStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: payload.reason,
      });
      await this.event(tx, actor, id, 'cancelled', { reason: payload.reason });
    });
    await this.audit.record(actor, 'UPDATE', 'expense', id, {
      organizationId: before.organizationId,
      branchId: before.branchId,
      changes: { status: { from: STATUS_TO_V2[before.status], to: 'cancelled' } },
    });

    return this.detail(user, actor, id);
  }

  async remove(
    user: RequestUser,
    actor: V2Actor,
    id: number,
    payload: V2ExpenseLifecycleDto,
  ): Promise<void> {
    const before = await this.findOwned(user, actor, id);
    this.assertVersion(before, payload.expected_version);
    if (new Prisma.Decimal(before.paidAmount).greaterThan(0)) {
      throw new ConflictException(
        'To‘lov qilingan xarajatni o‘chirib bo‘lmaydi. Avval to‘lovlarni bekor qiling',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await this.bumpVersion(tx, before, {
        deleted_at: new Date(),
        deleteReason: payload.reason,
      });
      await this.event(tx, actor, id, 'soft_deleted', { reason: payload.reason });
    });
    await this.audit.record(actor, 'DELETE', 'expense', id, {
      organizationId: before.organizationId,
      branchId: before.branchId,
      changes: { title: before.title, reason: payload.reason },
    });
  }

  async addPayment(
    user: RequestUser,
    actor: V2Actor,
    id: number,
    payload: V2CreateExpensePaymentDto,
  ) {
    const existing = await this.prisma.expensePayment.findUnique({
      where: { idempotencyKey: payload.idempotency_key },
    });
    if (existing) {
      if (existing.expenseId !== id) {
        throw new BadRequestException('Takroriy so‘rov kaliti noto‘g‘ri');
      }
      const owner = await this.findOwned(user, actor, id);
      return { data: this.toPayment(existing, owner) };
    }

    const before = await this.findOwned(user, actor, id);
    this.assertVersion(before, payload.expected_version);
    if (before.status === ExpenseStatus.CANCELLED) {
      throw new ConflictException('Bekor qilingan xarajatga to‘lov qilib bo‘lmaydi');
    }

    const amount = new Prisma.Decimal(payload.amount);
    const total = new Prisma.Decimal(before.amount);
    const paid = new Prisma.Decimal(before.paidAmount);
    if (!amount.greaterThan(0)) {
      throw new BadRequestException('To‘lov summasi musbat bo‘lishi kerak');
    }
    if (paid.plus(amount).greaterThan(total)) {
      throw new BadRequestException(
        `To‘lov qoldiqdan oshmasligi kerak (qoldiq: ${moneyString(total.minus(paid))})`,
      );
    }

    try {
      const payment = await this.prisma.$transaction(async (tx) => {
        const created = await tx.expensePayment.create({
          data: {
            expenseId: id,
            amount,
            method: fromV2PaymentMethod(payload.payment_method)!,
            date: tashkentDayStart(payload.date),
            note: payload.note || null,
            recordedById: actor.id,
            idempotencyKey: payload.idempotency_key,
          },
        });
        const nextPaid = paid.plus(amount);
        const status = statusFor(total, nextPaid);
        await this.bumpVersion(tx, before, {
          paidAmount: nextPaid,
          status,
          paidAt: status === ExpenseStatus.PAID ? new Date() : null,
        });
        await this.event(
          tx,
          actor,
          id,
          'payment_recorded',
          {
            amount: moneyString(amount),
            payment_method: payload.payment_method,
            date: payload.date,
          },
          created.id,
        );
        return created;
      });

      await this.audit.record(actor, 'CREATE', 'expense_payment', payment.id, {
        organizationId: before.organizationId,
        branchId: before.branchId,
        changes: { expense_id: id, amount: moneyString(amount) },
      });

      return { data: this.toPayment(payment, before) };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Bu to‘lov allaqachon yozilgan');
      }
      throw error;
    }
  }

  async voidPayment(
    user: RequestUser,
    actor: V2Actor,
    id: number,
    paymentId: number,
    payload: V2ExpenseLifecycleDto,
  ) {
    const before = await this.findOwned(user, actor, id);
    this.assertVersion(before, payload.expected_version);
    const payment = await this.prisma.expensePayment.findFirst({
      where: { id: paymentId, expenseId: id },
    });
    if (!payment) throw new NotFoundException('To‘lov topilmadi');
    if (payment.voidedAt) {
      throw new ConflictException('To‘lov allaqachon bekor qilingan');
    }

    const voided = await this.prisma.$transaction(async (tx) => {
      const row = await tx.expensePayment.update({
        where: { id: paymentId },
        data: {
          voidedAt: new Date(),
          voidedById: actor.id,
          voidReason: payload.reason,
        },
      });
      const nextPaid = Prisma.Decimal.max(
        ZERO,
        new Prisma.Decimal(before.paidAmount).minus(payment.amount),
      );
      await this.bumpVersion(tx, before, {
        paidAmount: nextPaid,
        status:
          before.status === ExpenseStatus.CANCELLED
            ? ExpenseStatus.CANCELLED
            : statusFor(new Prisma.Decimal(before.amount), nextPaid),
        paidAt: null,
      });
      await this.event(
        tx,
        actor,
        id,
        'payment_voided',
        { amount: moneyString(payment.amount), reason: payload.reason },
        paymentId,
      );
      return row;
    });

    await this.audit.record(actor, 'UPDATE', 'expense_payment', paymentId, {
      organizationId: before.organizationId,
      branchId: before.branchId,
      changes: { voided: true, reason: payload.reason },
    });

    return { data: this.toPayment(voided, before) };
  }

  // --- Yordamchilar ---------------------------------------------------------

  private async listWhere(
    user: RequestUser,
    actor: V2Actor,
    query: Partial<V2ExpensesQueryDto>,
    headerBranchId: number | null,
  ): Promise<Prisma.ExpenseWhereInput | null> {
    const org = this.scope.org(user);
    if (!org) return null;

    const and: Prisma.ExpenseWhereInput[] = [{ ...org, deleted_at: null }];

    if (query.scope === 'company') {
      if (!CROSS_BRANCH_ROLES.includes(actor.role)) {
        throw new ForbiddenException('Markaz xarajatlarini ko‘rish huquqi yo‘q');
      }
      and.push({ branchId: null });
    } else {
      const { branchId } = await this.scope.read(
        user,
        actor,
        headerBranchId,
        query.branch_id,
      );
      if (branchId) and.push({ branchId });
    }

    if (query.category) and.push({ category: query.category });

    if (query.attention === 'overdue') {
      const today = tashkentDateKey(new Date());
      and.push({
        status: { in: OPEN_EXPENSE_STATUSES },
        dueDate: { lt: tashkentDayStart(today) },
      });
    } else if (query.status) {
      and.push({ status: STATUS_FROM_V2[query.status] });
    }

    const range = dayRange(query.date_from, query.date_to);
    if (range) and.push({ expenseDate: range });

    if (query.search) {
      and.push({
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { payee: { contains: query.search, mode: 'insensitive' } },
          { note: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }

    return { AND: and };
  }

  /** Menejer faqat o'z filialidagi xarajatlarni ko'radi. */
  private managerBranch(actor: V2Actor): Prisma.ExpenseWhereInput {
    return CROSS_BRANCH_ROLES.includes(actor.role)
      ? {}
      : { branchId: actor.homeBranchId ?? -1 };
  }

  private async findOwned(
    user: RequestUser,
    actor: V2Actor,
    id: number,
  ): Promise<ExpenseRow> {
    const org: OrgWhere | null = this.scope.org(user);
    const row = org
      ? await this.prisma.expense.findFirst({
          where: { id, ...org, deleted_at: null, ...this.managerBranch(actor) },
          include: EXPENSE_INCLUDE,
        })
      : null;
    if (!row) throw new NotFoundException('Xarajat topilmadi');
    return row;
  }

  private findByIdempotency(key: string) {
    return this.prisma.expense.findUnique({
      where: { idempotencyKey: key },
      select: { id: true },
    });
  }

  private async resolveWriteBranch(
    user: RequestUser,
    actor: V2Actor,
    bodyBranchId: string | null | undefined,
    headerBranchId: number | null,
  ): Promise<number | null> {
    // Menejer va boshqa filial xodimlari faqat o'z filialiga yozadi.
    if (!CROSS_BRANCH_ROLES.includes(actor.role)) {
      const branchId = actor.homeBranchId ?? headerBranchId;
      if (!branchId) throw new BadRequestException('Filialni tanlang');
      await this.scope.assertBranch(user, branchId);
      return branchId;
    }

    if (bodyBranchId === null) return null;
    if (bodyBranchId === undefined) return headerBranchId;
    if (optionalId(bodyBranchId) === undefined) return null;
    return this.scope.optionalBranch(user, bodyBranchId);
  }

  private async createWithEvent(
    actor: V2Actor,
    data: Prisma.ExpenseUncheckedCreateInput,
  ) {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.expense.create({ data });
        await this.event(tx, actor, created.id, 'created', {
          title: created.title,
          amount: moneyString(created.amount),
          category: created.category,
        });
        return created;
      });
      await this.audit.record(actor, 'CREATE', 'expense', row.id, {
        organizationId: row.organizationId,
        branchId: row.branchId,
        changes: { title: row.title, amount: moneyString(row.amount) },
      });
      return row;
    } catch (error) {
      if (isUniqueViolation(error)) {
        const replay = await this.findByIdempotency(String(data.idempotencyKey));
        if (replay) return replay;
      }
      throw error;
    }
  }

  private assertVersion(row: Expense, expected: number) {
    if (row.version !== expected) throw new ConcurrentUpdateException();
  }

  /** Optimistik qulf bilan yangilash: versiya o'zgargan bo'lsa — 409. */
  private async bumpVersion(
    tx: Tx,
    before: Expense,
    data: Prisma.ExpenseUpdateInput,
  ): Promise<Expense> {
    const result = await tx.expense.updateMany({
      where: { id: before.id, version: before.version },
      data: { ...(data as Prisma.ExpenseUpdateManyMutationInput), version: { increment: 1 } },
    });
    if (result.count === 0) throw new ConcurrentUpdateException();

    return tx.expense.findUniqueOrThrow({ where: { id: before.id } });
  }

  private event(
    tx: Tx,
    actor: V2Actor,
    expenseId: number,
    action: string,
    changes: Record<string, unknown>,
    expensePaymentId?: number,
  ): Promise<ExpenseEvent> {
    return tx.expenseEvent.create({
      data: {
        expenseId,
        expensePaymentId: expensePaymentId ?? null,
        action,
        changes: JSON.parse(JSON.stringify(changes)) as Prisma.InputJsonValue,
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
      },
    });
  }

  private changesOf(before: Expense, after: Expense) {
    const view = (row: Expense) => ({
      title: row.title,
      category: row.category,
      amount: moneyString(row.amount),
      expense_date: dateKey(row.expenseDate),
      due_date: dateKey(row.dueDate),
      payee: row.payee,
      note: row.note,
      branch_id: row.branchId ? toId(row.branchId) : null,
    });
    const from = view(before);
    const to = view(after);
    const result: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of Object.keys(to) as (keyof typeof to)[]) {
      if (from[key] !== to[key]) result[key] = { from: from[key], to: to[key] };
    }
    return result;
  }

  private async branchNames(ids: (number | null)[]) {
    const unique = [...new Set(ids.filter((id): id is number => !!id))];
    const rows = unique.length
      ? await this.prisma.branch.findMany({
          where: { id: { in: unique } },
          select: { id: true, name: true },
        })
      : [];
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  private toExpense(row: ExpenseRow, branches: Map<number, string>, today: string) {
    const amount = new Prisma.Decimal(row.amount);
    const paid = new Prisma.Decimal(row.paidAmount);
    const due = dateKey(row.dueDate);
    const open = OPEN_EXPENSE_STATUSES.includes(row.status as never);
    const overdueDays = open && due && due < today ? daysBetween(due, today) : undefined;

    return {
      id: toId(row.id),
      branch_id: row.branchId ? toId(row.branchId) : null,
      branch_name: row.branchId ? (branches.get(row.branchId) ?? null) : null,
      created_by_id: row.createdById ? toId(row.createdById) : '',
      category: row.category,
      title: row.title,
      amount: moneyString(amount),
      expense_date: dateKey(row.expenseDate ?? row.created_at),
      due_date: due,
      payee: row.payee,
      note: row.note,
      teacher_id: row.teacherId ? toTeacherId(row.teacherId) : null,
      period_month: row.periodMonth,
      paid_amount: moneyString(paid),
      remaining_amount: moneyString(Prisma.Decimal.max(ZERO, amount.minus(paid))),
      status: STATUS_TO_V2[row.status],
      reviewed_at: iso(row.reviewedAt),
      reviewed_by_id: row.reviewedById ? toId(row.reviewedById) : null,
      version: row.version,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
      has_payment_history: (row.payments?.length ?? 0) > 0,
      ...(overdueDays !== undefined ? { overdue_days: overdueDays } : {}),
    };
  }

  private toPayment(payment: ExpensePayment, expense: Expense) {
    return {
      id: toId(payment.id),
      expense_id: toId(payment.expenseId),
      company_id: expense.organizationId ? toId(expense.organizationId) : '',
      branch_id: expense.branchId ? toId(expense.branchId) : null,
      amount: moneyString(payment.amount),
      payment_method: toV2PaymentMethod(payment.method),
      date: dateKey(payment.date),
      note: payment.note,
      recorded_by_id: payment.recordedById,
      idempotency_key: payment.idempotencyKey,
      voided_at: iso(payment.voidedAt),
      voided_by_id: payment.voidedById,
      void_reason: payment.voidReason,
      created_at: payment.created_at.toISOString(),
    };
  }

  private toEvent(event: ExpenseEvent) {
    return {
      id: toId(event.id),
      expense_id: toId(event.expenseId),
      expense_payment_id: event.expensePaymentId
        ? toId(event.expensePaymentId)
        : null,
      action: event.action,
      changes: (event.changes as Record<string, unknown> | null) ?? {},
      created_at: event.created_at.toISOString(),
      actor: { id: event.actorId, name: event.actorName, role: event.actorRole },
      impersonator: null,
    };
  }
}
