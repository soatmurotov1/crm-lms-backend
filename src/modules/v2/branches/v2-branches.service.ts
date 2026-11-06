import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, Status } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import {
  addDays,
  tashkentDateKey,
  tashkentDayStart,
} from 'src/common/utils/tashkent-time.util';
import { debtorsOf, summarizeBalances } from '../common/v2-balance';
import { V2BalanceService } from '../common/v2-balance.service';
import { V2ScopeService } from '../common/v2-scope.service';
import { toId } from '../common/v2.mapper';
import { paidPaymentsWhere } from '../common/v2-where';
import type { V2CreateBranchDto, V2UpdateBranchDto } from './dto/v2-branch.dto';

const BRANCH_SELECT = {
  id: true,
  name: true,
  address: true,
  phone: true,
  managerId: true,
  status: true,
  organizationId: true,
  created_at: true,
  updated_at: true,
  manager: { select: { fullName: true } },
} satisfies Prisma.BranchSelect;

type BranchRow = Prisma.BranchGetPayload<{ select: typeof BRANCH_SELECT }>;

/** Tushum grafigi uchun oylar soni (joriy oy bilan). */
const TREND_MONTHS = 6;
const TOP_DEBTORS = 5;

/** "O'chirilgan" filial — faol bo'lmagan filial: qator bazada qoladi. */
const isDeleted = (row: { status: Status }) => row.status !== Status.ACTIVE;

@Injectable()
export class V2BranchesService {
  constructor(
    private prisma: PrismaService,
    private scope: V2ScopeService,
    private balanceService: V2BalanceService,
  ) {}

  async list(user: RequestUser, includeDeleted = false) {
    // O'chirilganlarni faqat egasi ko'radi va tiklaydi.
    if (includeDeleted && !this.canManage(user)) {
      throw new ForbiddenException();
    }

    const org = this.scope.org(user);
    if (!org) return { data: [] };

    const rows = await this.prisma.branch.findMany({
      where: { ...org, ...(includeDeleted ? {} : { status: Status.ACTIVE }) },
      select: BRANCH_SELECT,
      orderBy: { id: 'asc' },
    });
    const counts = await this.activeStudentCounts(rows.map((row) => row.id));

    return {
      data: rows.map((row) => this.toBranch(row, counts.get(row.id) ?? 0)),
    };
  }

  async detail(user: RequestUser, id: number, now: Date = new Date()) {
    const row = await this.findOwned(user, id);

    const todayKey = tashkentDateKey(now);
    const today = {
      gte: tashkentDayStart(todayKey),
      lt: tashkentDayStart(addDays(todayKey, 1)),
    };
    const firstMonthKey = shiftMonth(todayKey.slice(0, 7), -(TREND_MONTHS - 1));
    const paidWhere = paidPaymentsWhere(
      { organizationId: row.organizationId },
      id,
    );

    const [counts, revenue, todayPayment, trendRows, { balances }] =
      await Promise.all([
        this.activeStudentCounts([id]),
        this.prisma.payment.aggregate({
          where: paidWhere,
          _sum: { amount: true },
        }),
        this.prisma.payment.aggregate({
          where: { AND: [paidWhere, { paidAt: today }] },
          _sum: { amount: true },
        }),
        this.prisma.payment.findMany({
          where: {
            AND: [
              paidWhere,
              { paidAt: { gte: tashkentDayStart(`${firstMonthKey}-01`) } },
            ],
          },
          select: { paidAt: true, amount: true },
        }),
        this.balanceService.load({ branchId: id }),
      ]);

    const byMonth = new Map<string, Prisma.Decimal>();
    for (const payment of trendRows) {
      if (!payment.paidAt) continue;
      const month = tashkentDateKey(payment.paidAt).slice(0, 7);
      byMonth.set(
        month,
        (byMonth.get(month) ?? new Prisma.Decimal(0)).plus(payment.amount),
      );
    }

    return {
      data: {
        ...this.toBranch(row, counts.get(id) ?? 0),
        revenue: revenue._sum.amount?.toNumber() ?? 0,
        debt: summarizeBalances(balances).debt.toNumber(),
        today_payment: todayPayment._sum.amount?.toNumber() ?? 0,
        // Tushumi yo'q oy ham 0 bilan chiqadi — grafikda bo'shliq qolmaydi.
        monthly_revenue: Array.from({ length: TREND_MONTHS }, (_, index) => {
          const month = shiftMonth(firstMonthKey, index);
          return { month, amount: byMonth.get(month)?.toNumber() ?? 0 };
        }),
        top_debtors: debtorsOf(balances)
          .slice(0, TOP_DEBTORS)
          .map((balance) => ({
            id: toId(balance.studentId),
            name: balance.fullName,
            debt: balance.debt.toNumber(),
          })),
      },
    };
  }

  async create(user: RequestUser, payload: V2CreateBranchDto) {
    if (!user.organizationId) {
      throw new BadRequestException(
        'Filial yaratish uchun hisob tashkilotga biriktirilgan bo‘lishi kerak',
      );
    }

    const row = await this.write(() =>
      this.prisma.branch.create({
        data: {
          name: payload.name,
          address: payload.location,
          phone: payload.phone || null,
          organizationId: user.organizationId as number,
        },
        select: BRANCH_SELECT,
      }),
    );

    return { data: this.toBranch(row, 0) };
  }

  async update(user: RequestUser, id: number, payload: V2UpdateBranchDto) {
    await this.findOwned(user, id);

    const row = await this.write(() =>
      this.prisma.branch.update({
        where: { id },
        data: {
          ...(payload.name !== undefined ? { name: payload.name } : {}),
          ...(payload.location !== undefined
            ? { address: payload.location }
            : {}),
          ...(payload.phone !== undefined
            ? { phone: payload.phone || null }
            : {}),
        },
        select: BRANCH_SELECT,
      }),
    );
    const counts = await this.activeStudentCounts([id]);

    return { data: this.toBranch(row, counts.get(id) ?? 0) };
  }

  /**
   * Filial o'chirilmaydi, nofaol qilinadi. Ichida faol guruh yoki o'quvchi
   * bo'lsa rad etiladi: ular hech qaysi filialda ko'rinmay qolardi.
   */
  async remove(user: RequestUser, id: number): Promise<void> {
    const row = await this.findOwned(user, id);
    if (isDeleted(row)) return;

    const [groups, students] = await Promise.all([
      this.prisma.group.count({
        where: { branchId: id, status: Status.ACTIVE, deleted_at: null },
      }),
      this.prisma.student.count({
        where: { branchId: id, deleted_at: null, lifecycle: 'active' },
      }),
    ]);

    if (groups || students) {
      throw new ConflictException(
        `Filialda ${groups} ta faol guruh va ${students} ta faol o‘quvchi bor. ` +
          'Avval ularni boshqa filialga o‘tkazing',
      );
    }

    await this.prisma.branch.update({
      where: { id },
      data: { status: Status.INACTIVE },
    });
  }

  async restore(user: RequestUser, id: number): Promise<void> {
    await this.findOwned(user, id);
    await this.prisma.branch.update({
      where: { id },
      data: { status: Status.ACTIVE },
    });
  }

  private canManage(user: RequestUser): boolean {
    return user.role === Role.SUPERADMIN || user.role === Role.ADMIN;
  }

  /** Begona tashkilot filiali "topilmadi" bo'lib ko'rinadi. */
  private async findOwned(user: RequestUser, id: number): Promise<BranchRow> {
    const org = this.scope.org(user);
    const row = org
      ? await this.prisma.branch.findFirst({
          where: { id, ...org },
          select: BRANCH_SELECT,
        })
      : null;

    if (!row || (isDeleted(row) && !this.canManage(user))) {
      throw new NotFoundException('Filial topilmadi');
    }

    return row;
  }

  private async activeStudentCounts(
    ids: number[],
  ): Promise<Map<number, number>> {
    if (!ids.length) return new Map();

    const rows = await this.prisma.student.groupBy({
      by: ['branchId'],
      where: { branchId: { in: ids }, deleted_at: null, lifecycle: 'active' },
      _count: { _all: true },
    });

    return new Map(
      rows.flatMap((row) =>
        row.branchId === null ? [] : [[row.branchId, row._count._all]],
      ),
    );
  }

  private async write<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Bu nomdagi filial allaqachon mavjud');
      }
      throw error;
    }
  }

  private toBranch(row: BranchRow, activeStudents: number) {
    return {
      id: toId(row.id),
      name: row.name,
      location: row.address ?? '',
      ...(row.phone ? { phone: row.phone } : {}),
      ...(row.managerId ? { manager_id: toId(row.managerId) } : {}),
      ...(row.manager ? { manager_name: row.manager.fullName } : {}),
      active_students: activeStudents,
      created_at: row.created_at.toISOString(),
      deleted_at: isDeleted(row) ? row.updated_at.toISOString() : null,
    };
  }
}

/** `YYYY-MM` ni berilgan oy soniga suradi. */
function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  const index = year * 12 + (month - 1) + delta;

  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}
