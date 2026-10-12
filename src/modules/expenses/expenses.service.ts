import { Injectable, NotFoundException } from '@nestjs/common';
import { ExpenseStatus, Prisma } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import {
  orgFilter,
  resolveOwnerOrganizationId,
} from 'src/common/utils/org-scope.util';
import {
  buildPaginatedResult,
  resolvePagination,
} from 'src/common/utils/pagination.util';
import {
  CreateExpenseDto,
  UpdateExpenseDto,
} from './dto/create-expense.dto';
import { ExpenseQueryDto } from './dto/expense-query.dto';

/** "Yaqinda to'lanadi" oynasi: muddatiga shuncha kun qolgan xarajatlar. */
const DUE_SOON_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const expenseInclude = {
  createdBy: { select: { id: true, fullName: true } },
} satisfies Prisma.ExpenseInclude;

@Injectable()
export class ExpensesService {
  constructor(private prisma: PrismaService) {}

  async getAll(user: RequestUser, query: ExpenseQueryDto) {
    const { take, skip } = resolvePagination(query);

    const where: Prisma.ExpenseWhereInput = {
      ...orgFilter(user),
      deleted_at: query.deleted ? { not: null } : null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.overdue
        ? { status: ExpenseStatus.PENDING, dueDate: { lt: new Date() } }
        : {}),
      ...(query.search
        ? { title: { contains: query.search, mode: 'insensitive' } }
        : {}),
      ...(query.from || query.to
        ? {
            created_at: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [expenses, total] = await this.prisma.$transaction([
      this.prisma.expense.findMany({
        where,
        include: expenseInclude,
        orderBy: { id: 'desc' },
        take,
        skip,
      }),
      this.prisma.expense.count({ where }),
    ]);

    return buildPaginatedResult(expenses, total, query, 'expenses/all');
  }

  /** Kunlik qisqa hisobot: bugun e'tibor talab qiladigan majburiyatlar. */
  async getSummary(user: RequestUser) {
    const now = new Date();
    const base = { ...orgFilter(user), deleted_at: null };
    const pending = { ...base, status: ExpenseStatus.PENDING };

    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfYesterday = new Date(startOfToday.getTime() - DAY_MS);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [dueSoon, overdue, createdYesterday, pendingAgg, paidThisMonth] =
      await this.prisma.$transaction([
        this.prisma.expense.count({
          where: {
            ...pending,
            dueDate: {
              gte: now,
              lte: new Date(now.getTime() + DUE_SOON_DAYS * DAY_MS),
            },
          },
        }),
        this.prisma.expense.count({
          where: { ...pending, dueDate: { lt: now } },
        }),
        this.prisma.expense.count({
          where: {
            ...base,
            created_at: { gte: startOfYesterday, lt: startOfToday },
          },
        }),
        this.prisma.expense.aggregate({
          where: pending,
          _count: { _all: true },
          _sum: { amount: true },
        }),
        this.prisma.expense.aggregate({
          where: {
            ...base,
            status: ExpenseStatus.PAID,
            paidAt: { gte: startOfMonth },
          },
          _sum: { amount: true },
        }),
      ]);

    return {
      success: true,
      data: {
        dueSoon,
        overdue,
        createdYesterday,
        pending: pendingAgg._count._all,
        pendingAmount: Number(pendingAgg._sum.amount ?? 0),
        paidThisMonth: Number(paidThisMonth._sum.amount ?? 0),
      },
    };
  }

  async create(user: RequestUser, payload: CreateExpenseDto) {
    const organizationId = resolveOwnerOrganizationId(user);
    const status = payload.status ?? ExpenseStatus.PENDING;

    const expense = await this.prisma.expense.create({
      data: {
        ...payload,
        status,
        dueDate: payload.dueDate ? new Date(payload.dueDate) : undefined,
        paidAt: status === ExpenseStatus.PAID ? new Date() : undefined,
        createdById: user.id,
        organizationId,
      },
      include: expenseInclude,
    });

    return { success: true, message: 'Xarajat yaratildi', data: expense };
  }

  async update(user: RequestUser, id: number, payload: UpdateExpenseDto) {
    const current = await this.ensureOwned(user, id);

    const expense = await this.prisma.expense.update({
      where: { id },
      data: {
        ...payload,
        dueDate: payload.dueDate ? new Date(payload.dueDate) : undefined,
        ...this.paidAtFor(current.status, payload.status),
      },
      include: expenseInclude,
    });

    return { success: true, data: expense };
  }

  async markPaid(user: RequestUser, id: number) {
    const current = await this.ensureOwned(user, id);

    const expense = await this.prisma.expense.update({
      where: { id },
      data: {
        status: ExpenseStatus.PAID,
        ...this.paidAtFor(current.status, ExpenseStatus.PAID),
      },
      include: expenseInclude,
    });

    return { success: true, data: expense };
  }

  async remove(user: RequestUser, id: number) {
    await this.ensureOwned(user, id);

    await this.prisma.expense.update({
      where: { id },
      data: { deleted_at: new Date() },
    });

    return { success: true, message: "Xarajat o'chirildi" };
  }

  async restore(user: RequestUser, id: number) {
    await this.ensureOwned(user, id, true);

    await this.prisma.expense.update({
      where: { id },
      data: { deleted_at: null },
    });

    return { success: true, message: 'Xarajat tiklandi' };
  }

  /** Holat o'zgarganda `paidAt` ham mos ravishda qo'yiladi yoki tozalanadi. */
  private paidAtFor(current: ExpenseStatus, next?: ExpenseStatus) {
    if (!next || next === current) return {};
    return { paidAt: next === ExpenseStatus.PAID ? new Date() : null };
  }

  /** Xarajat shu tashkilotnikimi — bo'lmasa "topilmadi". */
  private async ensureOwned(user: RequestUser, id: number, deleted = false) {
    const expense = await this.prisma.expense.findFirst({
      where: {
        id,
        ...orgFilter(user),
        deleted_at: deleted ? { not: null } : null,
      },
      select: { id: true, status: true },
    });

    if (!expense) {
      throw new NotFoundException('Xarajat topilmadi');
    }

    return expense;
  }
}
