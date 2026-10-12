import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AttendanceStatus,
  PaymentStatus,
  Prisma,
  Status,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import { orgFilter } from 'src/common/utils/org-scope.util';
import {
  addDays,
  daysBetween,
  isValidDateKey,
  monthStartKey,
  tashkentDateKey,
  tashkentDayStart,
  weekDayOf,
} from 'src/common/utils/tashkent-time.util';
import { bucketRevenue, computeDebts } from './dashboard.calc';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

/** Tanlash mumkin bo'lgan eng uzun oraliq (kabisa yili bilan bir yil). */
const MAX_RANGE_DAYS = 366;

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  /** `now` faqat test uchun: "bugun"ni qotirib qo'yish imkonini beradi. */
  async getSummary(
    user: RequestUser,
    query: DashboardQueryDto,
    now: Date = new Date(),
  ) {
    const todayKey = tashkentDateKey(now);
    const fromKey = query.from ?? monthStartKey(todayKey);
    const toKey = query.to ?? todayKey;

    if (!isValidDateKey(fromKey) || !isValidDateKey(toKey)) {
      throw new BadRequestException("Sana noto'g'ri (YYYY-MM-DD)");
    }
    if (fromKey > toKey) {
      throw new BadRequestException(
        "Boshlanish sanasi tugash sanasidan keyin bo'lmasligi kerak",
      );
    }
    if (daysBetween(fromKey, toKey) > MAX_RANGE_DAYS) {
      throw new BadRequestException(
        `Sana oralig'i ${MAX_RANGE_DAYS} kundan oshmasligi kerak`,
      );
    }

    // Oxirgi kun to'liq kirishi uchun yuqori chegara — keyingi kun boshi.
    const range = {
      gte: tashkentDayStart(fromKey),
      lt: tashkentDayStart(addDays(toKey, 1)),
    };
    const today = {
      gte: tashkentDayStart(todayKey),
      lt: tashkentDayStart(addDays(todayKey, 1)),
    };

    /*
      Barcha ko'rsatkichlar guruh orqali cheklanadi: tashkilot, filial va
      kurs turi. `branchId` tashkilot shartining YONIGA qo'shiladi — begona
      tashkilotning filial id si berilsa natija bo'sh chiqadi.
    */
    const groupWhere: Prisma.GroupWhereInput = {
      ...orgFilter(user),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.courseType ? { course: { type: query.courseType } } : {}),
    };
    const activeGroupWhere: Prisma.GroupWhereInput = {
      ...groupWhere,
      status: Status.ACTIVE,
    };
    const scoped = Boolean(query.branchId || query.courseType);

    const studentWhere: Prisma.StudentWhereInput = {
      status: UserStatus.ACTIVE,
      ...orgFilter(user),
      ...(scoped
        ? {
            studentGroups: {
              some: { status: Status.ACTIVE, group: activeGroupWhere },
            },
          }
        : {}),
    };
    const paidWhere: Prisma.PaymentWhereInput = {
      status: PaymentStatus.PAID,
      group: groupWhere,
    };
    const todayGroupsWhere: Prisma.GroupWhereInput = {
      ...activeGroupWhere,
      weekDays: { has: weekDayOf(todayKey) },
    };

    const [
      todayRevenue,
      trendRows,
      memberships,
      paidRows,
      activeStudents,
      newStudentsInRange,
      scheduledLessons,
      pendingAttendanceLessons,
      attendanceRows,
    ] = await Promise.all([
      this.prisma.payment.aggregate({
        where: { ...paidWhere, paidAt: today },
        _sum: { amount: true },
      }),
      this.prisma.payment.findMany({
        where: { ...paidWhere, paidAt: range },
        select: { paidAt: true, amount: true },
      }),
      // Qarz — joriy holat: sana oralig'i qo'llanmaydi.
      this.prisma.studentGroup.findMany({
        where: { status: Status.ACTIVE, group: activeGroupWhere },
        select: {
          studentId: true,
          groupId: true,
          group: { select: { course: { select: { price: true } } } },
          student: {
            select: { fullName: true, branch: { select: { name: true } } },
          },
        },
      }),
      this.prisma.payment.groupBy({
        by: ['studentId', 'groupId'],
        where: paidWhere,
        _sum: { amount: true },
      }),
      this.prisma.student.count({ where: studentWhere }),
      this.prisma.student.count({
        where: { ...studentWhere, created_at: range },
      }),
      this.prisma.group.count({ where: todayGroupsWhere }),
      // Bugun bironta ham davomat yozuvi kiritilmagan guruhlar.
      this.prisma.group.count({
        where: {
          ...todayGroupsWhere,
          lessons: { none: { attendances: { some: { created_at: today } } } },
        },
      }),
      this.prisma.attendance.groupBy({
        by: ['status'],
        where: { created_at: today, lesson: { group: groupWhere } },
        _count: { _all: true },
      }),
    ]);

    const debts = computeDebts(
      memberships.map((row) => ({
        studentId: row.studentId,
        groupId: row.groupId,
        price: row.group.course.price,
        fullName: row.student.fullName,
        branchName: row.student.branch?.name ?? null,
      })),
      paidRows.map((row) => ({
        studentId: row.studentId,
        groupId: row.groupId,
        paid: row._sum.amount,
      })),
    );

    const attendanceCount = (status: AttendanceStatus) =>
      attendanceRows.find((row) => row.status === status)?._count._all ?? 0;

    return {
      success: true as const,
      data: {
        generatedAt: now.toISOString(),
        todayRevenue: todayRevenue._sum.amount?.toNumber() ?? 0,
        totalDebt: debts.totalDebt,
        debtorCount: debts.debtorCount,
        activeStudents,
        newStudentsInRange,
        debtQueue: debts.debtQueue,
        today: {
          scheduledLessons,
          pendingAttendanceLessons,
          attendance: {
            present: attendanceCount(AttendanceStatus.PRESENT),
            absent: attendanceCount(AttendanceStatus.ABSENT),
            late: attendanceCount(AttendanceStatus.LATE),
            excused: attendanceCount(AttendanceStatus.EXCUSED),
          },
        },
        revenueTrend: bucketRevenue(trendRows, query.granularity ?? 'day'),
      },
    };
  }
}
