import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AttendanceStatus,
  CourseType,
  ExpenseStatus,
  Prisma,
  Status,
} from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import {
  addDays,
  daysBetween,
  isValidDateKey,
  monthStartKey,
  tashkentDateKey,
  tashkentDayStart,
} from 'src/common/utils/tashkent-time.util';
import type { V2Actor } from '../common/v2-auth.guard';
import {
  debtorsOf,
  summarizeBalances,
  type StudentBalance,
} from '../common/v2-balance';
import {
  V2BalanceService,
  studentCourseTypeWhere,
} from '../common/v2-balance.service';
import { V2ScopeService, type OrgWhere } from '../common/v2-scope.service';
import {
  OPEN_EXPENSE_STATUSES,
  liveExpensesWhere,
  paidPaymentsWhere,
} from '../common/v2-where';
import {
  fromV2CourseType,
  money,
  percent,
  toId,
  toV2CourseType,
} from '../common/v2.mapper';
import type {
  V2AnalyticsQueryDto,
  V2CompanyOverviewQueryDto,
  V2FinanceQueryDto,
} from './dto/v2-dashboard-query.dto';
import {
  ageDebts,
  bucketRevenueTrend,
  deltaPercent,
} from './v2-dashboard.calc';

/** Tanlash mumkin bo'lgan eng uzun oraliq (kabisa yili bilan bir yil). */
const MAX_RANGE_DAYS = 366;
const RECOVERY_QUEUE_SIZE = 10;
/** Analitika grafiklaridagi oylar soni (joriy oy bilan). */
const TREND_MONTHS = 6;

/** Frontend biladigan xarajat turlari; qolgani "other" ga tushadi. */
const EXPENSE_CATEGORIES = new Set([
  'rent',
  'utilities',
  'vehicle',
  'marketing',
  'supplies',
  'administrative',
  'teacher_settlement',
]);

const ZERO = new Prisma.Decimal(0);
const sum = (values: Prisma.Decimal[]) =>
  values.reduce((total, value) => total.plus(value), ZERO);

type Period = { fromKey: string; toKey: string; todayKey: string };
type Range = { gte: Date; lt: Date };

const LIFECYCLES = ['active', 'completed', 'dropped', 'suspended'] as const;
const RESULTS = ['oqimoqda', 'topshirdi', 'yiqildi'] as const;

@Injectable()
export class V2DashboardService {
  constructor(
    private prisma: PrismaService,
    private scope: V2ScopeService,
    private balanceService: V2BalanceService,
  ) {}

  /** `now` faqat test uchun: "bugun"ni qotirib qo'yish imkonini beradi. */
  async companyOverview(
    user: RequestUser,
    query: V2CompanyOverviewQueryDto,
    headerBranchId: number | null,
    now: Date = new Date(),
  ) {
    const { fromKey, toKey, todayKey } = this.period(query, now);
    const granularity = query.granularity ?? 'day';
    const courseType = fromV2CourseType(query.course_type);

    const org = this.scope.org(
      user,
      query.company_id ? Number(query.company_id) : undefined,
    );
    const branchId = org
      ? await this.scope.branch(user, query.branch_id, headerBranchId)
      : null;

    // Oldingi davr — xuddi shu uzunlikdagi, bevosita oldin kelgan oraliq.
    const length = daysBetween(fromKey, toKey) + 1;
    const previousFromKey = addDays(fromKey, -length);
    const previousToKey = addDays(fromKey, -1);

    // Oxirgi kun to'liq kirishi uchun yuqori chegara — keyingi kun boshi.
    const rangeStart = tashkentDayStart(fromKey);
    const rangeEnd = tashkentDayStart(addDays(toKey, 1));
    const previousStart = tashkentDayStart(previousFromKey);
    const range = { gte: rangeStart, lt: rangeEnd };
    const today = this.range(todayKey, todayKey);

    const filters = {
      ...(branchId ? { branch_id: toId(branchId) } : {}),
      ...(query.course_type ? { course_type: query.course_type } : {}),
      from: fromKey,
      to: toKey,
      granularity,
    };
    const periodMeta = {
      period_from: fromKey,
      period_to: rangeEnd.toISOString(),
      period_to_inclusive: toKey,
      previous_period_from: previousFromKey,
      previous_period_to: rangeStart.toISOString(),
      previous_period_to_inclusive: previousToKey,
    };

    if (!org) {
      return { data: this.emptyOverview(filters, periodMeta, now) };
    }

    const studentWhere = this.studentWhere(org, branchId, courseType);
    const paidWhere = paidPaymentsWhere(
      org,
      branchId,
      courseType ? { student: studentCourseTypeWhere(courseType) } : {},
    );
    const lessonWhere: Prisma.LessonWhereInput = {
      group: {
        ...org,
        deleted_at: null,
        status: Status.ACTIVE,
        ...(branchId ? { branchId } : {}),
        ...(courseType ? { courseType } : {}),
      },
    };

    const [
      payments,
      todayRevenue,
      latestPayment,
      { balances, lastPaymentAt },
      byLifecycle,
      byResult,
      newStudents,
      newStudentsPrevious,
      newByBranch,
      branches,
      todayLessons,
      attendanceToday,
      attendanceInRange,
    ] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          AND: [paidWhere, { paidAt: { gte: previousStart, lt: rangeEnd } }],
        },
        select: {
          studentId: true,
          paidAt: true,
          amount: true,
          branchId: true,
          group: { select: { branchId: true } },
        },
      }),
      this.prisma.payment.aggregate({
        where: { AND: [paidWhere, { paidAt: today }] },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: paidWhere,
        _max: { paidAt: true },
      }),
      this.balanceService.load(studentWhere),
      this.prisma.student.groupBy({
        by: ['lifecycle'],
        where: studentWhere,
        _count: { _all: true },
      }),
      this.prisma.student.groupBy({
        by: ['result'],
        where: studentWhere,
        _count: { _all: true },
      }),
      this.prisma.student.count({
        where: { ...studentWhere, created_at: range },
      }),
      this.prisma.student.count({
        where: {
          ...studentWhere,
          created_at: { gte: previousStart, lt: rangeStart },
        },
      }),
      this.prisma.student.groupBy({
        by: ['branchId'],
        where: { ...studentWhere, created_at: range },
        _count: { _all: true },
      }),
      this.prisma.branch.findMany({
        where: {
          ...org,
          status: Status.ACTIVE,
          ...(branchId ? { id: branchId } : {}),
        },
        select: { id: true, name: true },
        orderBy: { id: 'asc' },
      }),
      this.prisma.lesson.findMany({
        where: { ...lessonWhere, date: today },
        select: {
          id: true,
          title: true,
          date: true,
          lessonType: true,
          group: { select: { name: true, branchId: true } },
          _count: { select: { attendances: true } },
        },
        orderBy: { date: 'asc' },
      }),
      this.prisma.attendance.groupBy({
        by: ['status'],
        where: { lesson: { ...lessonWhere, date: today } },
        _count: { _all: true },
      }),
      this.prisma.attendance.groupBy({
        by: ['status'],
        where: { lesson: { ...lessonWhere, date: range } },
        _count: { _all: true },
      }),
    ]);

    const inPeriod = payments.filter(
      (payment) => payment.paidAt && payment.paidAt >= rangeStart,
    );
    const periodRevenue = sum(inPeriod.map((payment) => payment.amount));
    const previousRevenue = sum(
      payments
        .filter((payment) => payment.paidAt && payment.paidAt < rangeStart)
        .map((payment) => payment.amount),
    );
    const typeOf = new Map(
      balances.map((balance) => [balance.studentId, balance.courseType]),
    );
    const revenueOf = (type: CourseType) =>
      sum(
        inPeriod
          .filter(
            (payment) =>
              (typeOf.get(payment.studentId) ?? CourseType.AUTO_SCHOOL) ===
              type,
          )
          .map((payment) => payment.amount),
      ).toNumber();

    const totals = summarizeBalances(balances);
    const debtors = debtorsOf(balances);
    const lifecycle = countBy(byLifecycle, 'lifecycle', LIFECYCLES);
    const results = countBy(byResult, 'result', RESULTS);

    const countAttendance = (
      rows: { status: AttendanceStatus; _count: { _all: number } }[],
      status: AttendanceStatus,
    ) => rows.find((row) => row.status === status)?._count._all ?? 0;
    const attended =
      countAttendance(attendanceInRange, AttendanceStatus.PRESENT) +
      countAttendance(attendanceInRange, AttendanceStatus.LATE);
    const attendanceTotal = attendanceInRange.reduce(
      (total, row) => total + row._count._all,
      0,
    );

    const toLesson = (lesson: (typeof todayLessons)[number]) => ({
      id: toId(lesson.id),
      title: lesson.title,
      date: (lesson.date ?? now).toISOString(),
      group_name: lesson.group.name,
      branch_id: lesson.group.branchId ? toId(lesson.group.branchId) : '',
    });

    return {
      data: {
        timezone: 'Asia/Tashkent' as const,
        filters,
        freshness: {
          generated_at: now.toISOString(),
          data_through: latestPayment._max.paidAt?.toISOString() ?? null,
        },
        kpis: {
          revenue: {
            today: todayRevenue._sum.amount?.toNumber() ?? 0,
            period: periodRevenue.toNumber(),
            previous_period: previousRevenue.toNumber(),
            ...periodMeta,
            delta_percent: deltaPercent(
              periodRevenue.toNumber(),
              previousRevenue.toNumber(),
            ),
            currency: 'UZS' as const,
          },
          debt: {
            current_outstanding: totals.debt.toNumber(),
            students_with_debt: debtors.length,
            avg_per_debtor: debtors.length
              ? Math.round(totals.debt.toNumber() / debtors.length)
              : 0,
          },
          students: {
            active: lifecycle.active,
            new: newStudents,
            new_previous_period: newStudentsPrevious,
            completed: lifecycle.completed,
            dropped: lifecycle.dropped,
            suspended: lifecycle.suspended,
          },
          result_stats: results,
          course_mix: {
            tezkor: balances.filter(
              (balance) => balance.courseType === CourseType.EXPRESS,
            ).length,
            avto_maktab: balances.filter(
              (balance) => balance.courseType === CourseType.AUTO_SCHOOL,
            ).length,
          },
          collection: {
            paid: totals.fullyPaid,
            partial: totals.partial,
            debt: totals.unpaid,
            coverage_rate: percent(totals.fullyPaid, totals.students),
          },
          debt_aging: ageDebts(debtors, lastPaymentAt, now),
          arpu: lifecycle.active
            ? Math.round(periodRevenue.toNumber() / lifecycle.active)
            : 0,
          cash_collection_rate: percent(
            totals.paid.toNumber(),
            totals.totalPrice.toNumber(),
          ),
          revenue_by_course_type: {
            tezkor: {
              revenue: revenueOf(CourseType.EXPRESS),
              per_lesson: null,
            },
            avto_maktab: {
              revenue: revenueOf(CourseType.AUTO_SCHOOL),
              per_lesson: null,
            },
          },
          attendance_rate: attendanceTotal
            ? percent(attended, attendanceTotal)
            : null,
        },
        revenue_trend: bucketRevenueTrend(inPeriod, granularity),
        branch_performance: branches.map((branch) => {
          const own = balances.filter(
            (balance) => balance.branchId === branch.id,
          );
          const ownTotals = summarizeBalances(own);

          return {
            id: toId(branch.id),
            name: branch.name,
            active_students: own.length,
            collected_revenue: sum(
              inPeriod
                .filter(
                  (payment) =>
                    (payment.branchId ?? payment.group?.branchId) === branch.id,
                )
                .map((payment) => payment.amount),
            ).toNumber(),
            outstanding_debt: ownTotals.debt.toNumber(),
            new_students:
              newByBranch.find((row) => row.branchId === branch.id)?._count
                ._all ?? 0,
            collection_rate: percent(
              ownTotals.paid.toNumber(),
              ownTotals.totalPrice.toNumber(),
            ),
          };
        }),
        recovery_queue: debtors
          .slice(0, RECOVERY_QUEUE_SIZE)
          .map((debtor: StudentBalance) => ({
            student_id: toId(debtor.studentId),
            student_name: debtor.fullName,
            branch_name: debtor.branchName ?? '',
            course_type: toV2CourseType(debtor.courseType),
            debt: debtor.debt.toNumber(),
            total_price: debtor.totalPrice.toNumber(),
            last_payment_at:
              lastPaymentAt.get(debtor.studentId)?.toISOString() ?? null,
          })),
        operations: {
          next_lessons: todayLessons
            .filter((lesson) => !lesson.date || lesson.date >= now)
            .map((lesson) => ({
              ...toLesson(lesson),
              lesson_type: lesson.lessonType,
            })),
          incomplete_attendance_lessons: todayLessons
            .filter((lesson) => lesson._count.attendances === 0)
            .map(toLesson),
          attendance_status: {
            present: countAttendance(attendanceToday, AttendanceStatus.PRESENT),
            absent: countAttendance(attendanceToday, AttendanceStatus.ABSENT),
            late: countAttendance(attendanceToday, AttendanceStatus.LATE),
            excused: countAttendance(attendanceToday, AttendanceStatus.EXCUSED),
          },
        },
      },
    };
  }

  /** Eski bosh sahifa analitikasi (oylar kesimida). */
  async analytics(
    user: RequestUser,
    actor: V2Actor,
    query: V2AnalyticsQueryDto,
    headerBranchId: number | null,
    now: Date = new Date(),
  ) {
    const scope = await this.scope.read(
      user,
      actor,
      headerBranchId,
      query.branch_id,
    );
    const courseType = fromV2CourseType(query.course_type);
    const todayKey = tashkentDateKey(now);
    const thisMonthKey = monthStartKey(todayKey);
    const lastMonthKey = `${shiftMonth(thisMonthKey.slice(0, 7), -1)}-01`;
    const firstTrendKey = `${shiftMonth(thisMonthKey.slice(0, 7), -(TREND_MONTHS - 1))}-01`;
    const months = Array.from({ length: TREND_MONTHS }, (_, index) =>
      shiftMonth(firstTrendKey.slice(0, 7), index),
    );

    const empty = {
      total_students: 0,
      active_tezkor: 0,
      active_avto: 0,
      new_this_month: 0,
      new_last_month: 0,
      total_revenue: 0,
      total_debt: 0,
      avg_debt: 0,
      this_month_revenue: 0,
      last_month_revenue: 0,
      payment_status: { paid: 0, partial: 0, debt: 0 },
      result_stats: { oqimoqda: 0, topshirdi: 0, yiqildi: 0 },
      monthly_enrollment: months.map((month) => ({
        month,
        tezkor: 0,
        avto_maktab: 0,
      })),
      monthly_revenue: months.map((month) => ({ month, amount: 0 })),
      branch_stats: [] as {
        branch: string;
        students: number;
        revenue: number;
        debt: number;
      }[],
    };
    if (!scope.org) return { data: empty };

    const org = scope.org;
    const studentWhere = this.studentWhere(org, scope.branchId, courseType);
    const paidWhere = paidPaymentsWhere(
      org,
      scope.branchId,
      courseType ? { student: studentCourseTypeWhere(courseType) } : {},
    );
    const thisMonthStart = tashkentDayStart(thisMonthKey);
    const lastMonthStart = tashkentDayStart(lastMonthKey);
    const trendStart = tashkentDayStart(firstTrendKey);

    const [
      { balances },
      byResult,
      activeRows,
      newThisMonth,
      newLastMonth,
      revenueTotal,
      trendPayments,
      enrolled,
      branches,
    ] = await Promise.all([
      this.balanceService.load(studentWhere),
      this.prisma.student.groupBy({
        by: ['result'],
        where: studentWhere,
        _count: { _all: true },
      }),
      this.balanceService.load({ ...studentWhere, lifecycle: 'active' }),
      this.prisma.student.count({
        where: { ...studentWhere, created_at: { gte: thisMonthStart } },
      }),
      this.prisma.student.count({
        where: {
          ...studentWhere,
          created_at: { gte: lastMonthStart, lt: thisMonthStart },
        },
      }),
      this.prisma.payment.aggregate({ where: paidWhere, _sum: { amount: true } }),
      this.prisma.payment.findMany({
        where: { AND: [paidWhere, { paidAt: { gte: trendStart } }] },
        select: {
          paidAt: true,
          amount: true,
          branchId: true,
          group: { select: { branchId: true } },
        },
      }),
      this.prisma.student.findMany({
        where: { ...studentWhere, created_at: { gte: trendStart } },
        select: { id: true, created_at: true },
      }),
      this.prisma.branch.findMany({
        where: {
          ...org,
          status: Status.ACTIVE,
          ...(scope.branchId ? { id: scope.branchId } : {}),
        },
        select: { id: true, name: true },
        orderBy: { id: 'asc' },
      }),
    ]);

    const totals = summarizeBalances(balances);
    const debtors = debtorsOf(balances);
    const typeOf = new Map(
      balances.map((balance) => [balance.studentId, balance.courseType]),
    );

    const revenueByMonth = new Map<string, Prisma.Decimal>();
    let thisMonthRevenue = ZERO;
    let lastMonthRevenue = ZERO;
    for (const payment of trendPayments) {
      if (!payment.paidAt) continue;
      const month = tashkentDateKey(payment.paidAt).slice(0, 7);
      revenueByMonth.set(
        month,
        (revenueByMonth.get(month) ?? ZERO).plus(payment.amount),
      );
      if (payment.paidAt >= thisMonthStart) {
        thisMonthRevenue = thisMonthRevenue.plus(payment.amount);
      } else if (payment.paidAt >= lastMonthStart) {
        lastMonthRevenue = lastMonthRevenue.plus(payment.amount);
      }
    }

    const enrollmentByMonth = new Map<
      string,
      { tezkor: number; avto_maktab: number }
    >();
    for (const row of enrolled) {
      const month = tashkentDateKey(row.created_at).slice(0, 7);
      const bucket = enrollmentByMonth.get(month) ?? {
        tezkor: 0,
        avto_maktab: 0,
      };
      if (typeOf.get(row.id) === CourseType.EXPRESS) bucket.tezkor += 1;
      else bucket.avto_maktab += 1;
      enrollmentByMonth.set(month, bucket);
    }

    // Filial bo'yicha to'liq tushum (davrsiz) — guruhlash bitta so'rovda.
    const branchRevenue = await this.revenueByBranch(org, scope.branchId);

    return {
      data: {
        total_students: balances.length,
        active_tezkor: activeRows.balances.filter(
          (balance) => balance.courseType === CourseType.EXPRESS,
        ).length,
        active_avto: activeRows.balances.filter(
          (balance) => balance.courseType === CourseType.AUTO_SCHOOL,
        ).length,
        new_this_month: newThisMonth,
        new_last_month: newLastMonth,
        total_revenue: revenueTotal._sum.amount?.toNumber() ?? 0,
        total_debt: totals.debt.toNumber(),
        avg_debt: debtors.length
          ? Math.round(totals.debt.toNumber() / debtors.length)
          : 0,
        this_month_revenue: thisMonthRevenue.toNumber(),
        last_month_revenue: lastMonthRevenue.toNumber(),
        payment_status: {
          paid: totals.fullyPaid,
          partial: totals.partial,
          debt: totals.unpaid,
        },
        result_stats: countBy(byResult, 'result', RESULTS),
        monthly_enrollment: months.map((month) => ({
          month,
          ...(enrollmentByMonth.get(month) ?? { tezkor: 0, avto_maktab: 0 }),
        })),
        monthly_revenue: months.map((month) => ({
          month,
          amount: revenueByMonth.get(month)?.toNumber() ?? 0,
        })),
        branch_stats: branches.map((branch) => {
          const own = balances.filter(
            (balance) => balance.branchId === branch.id,
          );
          return {
            branch: branch.name,
            students: own.length,
            revenue: branchRevenue.get(branch.id)?.toNumber() ?? 0,
            debt: summarizeBalances(own).debt.toNumber(),
          };
        }),
      },
    };
  }

  /** O'qituvchi bosh sahifasi: o'z guruhlari va o'quvchilari. */
  async teacherAnalytics(actor: V2Actor) {
    if (actor.ref.kind !== 'teacher') {
      return {
        data: {
          active_groups: 0,
          total_students: 0,
          result_stats: { oqimoqda: 0, topshirdi: 0, yiqildi: 0 },
        },
      };
    }

    const groupWhere: Prisma.GroupWhereInput = {
      teacherId: actor.ref.id,
      status: Status.ACTIVE,
      deleted_at: null,
    };
    const studentWhere: Prisma.StudentWhereInput = {
      deleted_at: null,
      studentGroups: { some: { status: Status.ACTIVE, group: groupWhere } },
    };

    const [groups, students, byResult] = await Promise.all([
      this.prisma.group.count({ where: groupWhere }),
      this.prisma.student.count({ where: studentWhere }),
      this.prisma.student.groupBy({
        by: ['result'],
        where: studentWhere,
        _count: { _all: true },
      }),
    ]);

    return {
      data: {
        active_groups: groups,
        total_students: students,
        result_stats: countBy(byResult, 'result', RESULTS),
      },
    };
  }

  /**
   * Davr bo'yicha pul oqimi: tushum, to'langan xarajat va qoldiq.
   *
   * Filial tanlanganda xarajatlardan faqat shu filialniki olinadi —
   * tashkilot darajasidagi (filialsiz) xarajat hech qaysi filialga yozilmaydi.
   */
  async financeSummary(
    user: RequestUser,
    query: V2FinanceQueryDto,
    headerBranchId: number | null,
    now: Date = new Date(),
  ) {
    const { fromKey, toKey } = this.period(query, now);
    const org = this.scope.org(user);

    if (!org) {
      return {
        data: {
          from: fromKey,
          to: toKey,
          income: money(0),
          paid_expenses: money(0),
          cash_flow_balance: money(0),
          outstanding_expenses: money(0),
          teacher_payable: money(0),
        },
      };
    }

    const branchId = await this.scope.branch(
      user,
      query.branch_id,
      headerBranchId,
    );
    const range = this.range(fromKey, toKey);

    const [income, paidTotal, outstanding, teacherPayable] = await Promise.all(
      [
        this.prisma.payment.aggregate({
          where: { AND: [paidPaymentsWhere(org, branchId), { paidAt: range }] },
          _sum: { amount: true },
        }),
        this.paidExpenses(org, branchId, range),
        this.outstandingExpenses(org, branchId),
        this.outstandingExpenses(org, branchId, 'teacher_settlement'),
      ],
    );

    const incomeTotal = income._sum.amount ?? ZERO;

    return {
      data: {
        from: fromKey,
        to: toKey,
        income: money(incomeTotal),
        paid_expenses: money(paidTotal),
        cash_flow_balance: money(incomeTotal.minus(paidTotal)),
        outstanding_expenses: money(outstanding),
        teacher_payable: money(teacherPayable),
      },
    };
  }

  /**
   * Xarajatlar tur va filial bo'yicha: xarajat sanasi davrga tushgan,
   * o'chirilmagan yozuvlarning summasi (bekor qilinganlari ham tarix sifatida).
   */
  async expenseBreakdown(
    user: RequestUser,
    query: V2FinanceQueryDto,
    headerBranchId: number | null = null,
    now: Date = new Date(),
  ) {
    const { fromKey, toKey } = this.period(query, now);
    const org = this.scope.org(user);
    const branchId = org
      ? await this.scope.branch(user, query.branch_id, headerBranchId)
      : null;
    const range = this.range(fromKey, toKey);

    const rows = org
      ? await this.prisma.expense.findMany({
          where: {
            ...liveExpensesWhere(org, branchId),
            OR: [
              { expenseDate: range },
              { expenseDate: null, created_at: range },
            ],
          },
          select: { category: true, amount: true, branchId: true },
        })
      : [];

    const byCategory = new Map<string, Prisma.Decimal>();
    const byBranch = new Map<number, Prisma.Decimal>();
    let companyWide = ZERO;

    for (const row of rows) {
      const key = row.category.trim().toLowerCase();
      const category = EXPENSE_CATEGORIES.has(key) ? key : 'other';
      byCategory.set(
        category,
        (byCategory.get(category) ?? ZERO).plus(row.amount),
      );

      if (row.branchId) {
        byBranch.set(
          row.branchId,
          (byBranch.get(row.branchId) ?? ZERO).plus(row.amount),
        );
      } else {
        companyWide = companyWide.plus(row.amount);
      }
    }

    const branchNames = byBranch.size
      ? await this.prisma.branch.findMany({
          where: { id: { in: [...byBranch.keys()] } },
          select: { id: true, name: true },
        })
      : [];

    return {
      data: {
        from: fromKey,
        to: toKey,
        total: money(sum(rows.map((row) => row.amount))),
        company_wide: { total: money(companyWide) },
        by_branch: [...byBranch.entries()]
          .sort(([, a], [, b]) => b.comparedTo(a))
          .map(([id, amount]) => ({
            branch_id: toId(id),
            branch_name:
              branchNames.find((branch) => branch.id === id)?.name ?? '',
            total: money(amount),
          })),
        by_category: [...byCategory.entries()]
          .sort(([, a], [, b]) => b.comparedTo(a))
          .map(([category, amount]) => ({ category, total: money(amount) })),
      },
    };
  }

  /**
   * Davrda haqiqatda to'langan xarajat: yangi panelda — to'lov yozuvlari,
   * eski panelda — "to'landi" deb belgilangan xarajatning o'zi.
   */
  private async paidExpenses(
    org: OrgWhere,
    branchId: number | null,
    range: Range,
  ): Promise<Prisma.Decimal> {
    const expenseWhere = liveExpensesWhere(org, branchId);

    const [ledger, legacy] = await Promise.all([
      this.prisma.expensePayment.aggregate({
        where: { voidedAt: null, date: range, expense: expenseWhere },
        _sum: { amount: true },
      }),
      this.prisma.expense.aggregate({
        where: {
          ...expenseWhere,
          status: ExpenseStatus.PAID,
          paidAt: range,
          payments: { none: {} },
        },
        _sum: { amount: true },
      }),
    ]);

    return (ledger._sum.amount ?? ZERO).plus(legacy._sum.amount ?? ZERO);
  }

  private async outstandingExpenses(
    org: OrgWhere,
    branchId: number | null,
    category?: string,
  ): Promise<Prisma.Decimal> {
    const result = await this.prisma.expense.aggregate({
      where: {
        ...liveExpensesWhere(org, branchId),
        status: { in: OPEN_EXPENSE_STATUSES },
        ...(category ? { category } : {}),
      },
      _sum: { amount: true, paidAmount: true },
    });

    return (result._sum.amount ?? ZERO).minus(result._sum.paidAmount ?? ZERO);
  }

  private async revenueByBranch(
    org: OrgWhere,
    branchId: number | null,
  ): Promise<Map<number, Prisma.Decimal>> {
    const rows = await this.prisma.payment.findMany({
      where: paidPaymentsWhere(org, branchId),
      select: {
        amount: true,
        branchId: true,
        group: { select: { branchId: true } },
        student: { select: { branchId: true } },
      },
    });

    const result = new Map<number, Prisma.Decimal>();
    for (const row of rows) {
      const id = row.branchId ?? row.group?.branchId ?? row.student.branchId;
      if (!id) continue;
      result.set(id, (result.get(id) ?? ZERO).plus(row.amount));
    }

    return result;
  }

  private studentWhere(
    org: OrgWhere,
    branchId: number | null,
    courseType?: CourseType,
  ): Prisma.StudentWhereInput {
    return {
      ...org,
      deleted_at: null,
      ...(branchId ? { branchId } : {}),
      ...(courseType ? studentCourseTypeWhere(courseType) : {}),
    };
  }

  private range(fromKey: string, toKey: string): Range {
    return {
      gte: tashkentDayStart(fromKey),
      lt: tashkentDayStart(addDays(toKey, 1)),
    };
  }

  private period(query: { from?: string; to?: string }, now: Date): Period {
    const todayKey = tashkentDateKey(now);
    const fromKey = query.from ?? monthStartKey(todayKey);
    const toKey = query.to ?? todayKey;

    if (!isValidDateKey(fromKey) || !isValidDateKey(toKey)) {
      throw new BadRequestException('Sana noto‘g‘ri (YYYY-MM-DD)');
    }
    if (fromKey > toKey) {
      throw new BadRequestException(
        'Boshlanish sanasi tugash sanasidan keyin bo‘lmasligi kerak',
      );
    }
    if (daysBetween(fromKey, toKey) > MAX_RANGE_DAYS) {
      throw new BadRequestException(
        `Sana oralig‘i ${MAX_RANGE_DAYS} kundan oshmasligi kerak`,
      );
    }

    return { fromKey, toKey, todayKey };
  }

  /** Tashkilotga biriktirilmagan xodim uchun: shakl to'liq, qiymatlar nol. */
  private emptyOverview(
    filters: Record<string, string>,
    periodMeta: Record<string, string>,
    now: Date,
  ) {
    return {
      timezone: 'Asia/Tashkent' as const,
      filters,
      freshness: { generated_at: now.toISOString(), data_through: null },
      kpis: {
        revenue: {
          today: 0,
          period: 0,
          previous_period: 0,
          ...periodMeta,
          delta_percent: null,
          currency: 'UZS' as const,
        },
        debt: {
          current_outstanding: 0,
          students_with_debt: 0,
          avg_per_debtor: 0,
        },
        students: {
          active: 0,
          new: 0,
          new_previous_period: 0,
          completed: 0,
          dropped: 0,
          suspended: 0,
        },
        result_stats: { oqimoqda: 0, topshirdi: 0, yiqildi: 0 },
        course_mix: { tezkor: 0, avto_maktab: 0 },
        collection: { paid: 0, partial: 0, debt: 0, coverage_rate: 0 },
        debt_aging: {
          bucket_0_30: 0,
          bucket_31_60: 0,
          bucket_61_90: 0,
          bucket_90_plus: 0,
        },
        arpu: 0,
        cash_collection_rate: 0,
        revenue_by_course_type: {
          tezkor: { revenue: 0, per_lesson: null },
          avto_maktab: { revenue: 0, per_lesson: null },
        },
        attendance_rate: null,
      },
      revenue_trend: [],
      branch_performance: [],
      recovery_queue: [],
      operations: {
        next_lessons: [],
        incomplete_attendance_lessons: [],
        attendance_status: { present: 0, absent: 0, late: 0, excused: 0 },
      },
    };
  }
}

/** `groupBy` natijasidan barcha ma'lum qiymatlar bo'yicha son (yo'g'i — 0). */
function countBy<K extends string, T extends string>(
  rows: ({ _count: { _all: number } } & Record<K, string>)[],
  key: K,
  values: readonly T[],
): Record<T, number> {
  const result = Object.fromEntries(values.map((value) => [value, 0])) as Record<
    T,
    number
  >;
  for (const row of rows) {
    const value = String(row[key]) as T;
    if (value in result) result[value] += row._count._all;
  }
  return result;
}

/** `YYYY-MM` ni berilgan oy soniga suradi. */
function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  const index = year * 12 + (month - 1) + delta;

  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}
