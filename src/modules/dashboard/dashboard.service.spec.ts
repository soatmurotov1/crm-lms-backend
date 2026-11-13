import { BadRequestException } from '@nestjs/common';
import {
  AttendanceStatus,
  CourseType,
  PaymentStatus,
  Prisma,
  Role,
  Status,
  UserStatus,
  WeekDays,
} from '@prisma/client';
import { DashboardService } from './dashboard.service';
import type { PrismaService } from 'src/common/prisma/prisma.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';

const d = (value: number) => new Prisma.Decimal(value);

function createPrismaMock() {
  return {
    payment: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    studentGroup: { findMany: jest.fn().mockResolvedValue([]) },
    student: { count: jest.fn().mockResolvedValue(0) },
    group: { count: jest.fn().mockResolvedValue(0) },
    attendance: { groupBy: jest.fn().mockResolvedValue([]) },
  };
}

const adminOrgA: RequestUser = {
  id: 2,
  phone: '+998900000002',
  fullName: 'Admin A',
  role: Role.ADMIN,
  organizationId: 10,
};

const superAdmin: RequestUser = {
  id: 1,
  phone: '+998900000001',
  fullName: 'Super Admin',
  role: Role.SUPERADMIN,
  organizationId: null,
};

// Juma, 9-oktabr 2026, Toshkentda 23:29 (UTC 18:29).
const NOW = new Date('2026-10-09T18:29:00.000Z');

type WhereCall = { where: Record<string, unknown> };
const firstWhere = (mock: jest.Mock, call = 0) =>
  (mock.mock.calls[call] as [WhereCall])[0].where;

describe('DashboardService.getSummary', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: DashboardService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new DashboardService(prisma as unknown as PrismaService);
  });

  it('bo‘sh bazada nolli javob qaytaradi', async () => {
    const result = await service.getSummary(adminOrgA, {}, NOW);

    expect(result).toEqual({
      success: true,
      data: {
        generatedAt: NOW.toISOString(),
        todayRevenue: 0,
        totalDebt: 0,
        debtorCount: 0,
        activeStudents: 0,
        newStudentsInRange: 0,
        debtQueue: [],
        today: {
          scheduledLessons: 0,
          pendingAttendanceLessons: 0,
          attendance: { present: 0, absent: 0, late: 0, excused: 0 },
        },
        revenueTrend: [],
      },
    });
  });

  it('har bir so‘rovga tashkilot shartini qo‘shadi', async () => {
    await service.getSummary(adminOrgA, {}, NOW);

    const org = { organizationId: 10 };

    expect(firstWhere(prisma.payment.aggregate).group).toMatchObject(org);
    expect(firstWhere(prisma.payment.findMany).group).toMatchObject(org);
    expect(firstWhere(prisma.payment.groupBy).group).toMatchObject(org);
    expect(firstWhere(prisma.studentGroup.findMany).group).toMatchObject(org);
    expect(firstWhere(prisma.student.count, 0)).toMatchObject(org);
    expect(firstWhere(prisma.student.count, 1)).toMatchObject(org);
    expect(firstWhere(prisma.group.count, 0)).toMatchObject(org);
    expect(firstWhere(prisma.group.count, 1)).toMatchObject(org);
    expect(
      (firstWhere(prisma.attendance.groupBy).lesson as { group: unknown })
        .group,
    ).toMatchObject(org);
  });

  it('SUPERADMIN uchun tashkilot sharti qo‘yilmaydi', async () => {
    await service.getSummary(superAdmin, {}, NOW);

    expect(firstWhere(prisma.student.count, 0)).not.toHaveProperty(
      'organizationId',
    );
    expect(firstWhere(prisma.payment.aggregate).group).not.toHaveProperty(
      'organizationId',
    );
  });

  // Tashkilotsiz hisob tashkilotsiz yozuvlarni (boshqalarnikini) ko'rmasligi kerak.
  it('tashkilotsiz xodimga nolli javob, bazaga bormaydi', async () => {
    const { data } = await service.getSummary(
      { ...adminOrgA, organizationId: null },
      {},
      NOW,
    );

    expect(data.totalDebt).toBe(0);
    expect(data.debtQueue).toEqual([]);
    expect(data.revenueTrend).toEqual([]);
    expect(prisma.payment.aggregate).not.toHaveBeenCalled();
    expect(prisma.studentGroup.findMany).not.toHaveBeenCalled();
    expect(prisma.student.count).not.toHaveBeenCalled();
  });

  // Review Focus 2: branchId tashkilot shartini ALMASHTIRMAYDI, yoniga qo'shiladi.
  it('filial va kurs turi filtri tashkilot sharti bilan birga qo‘llanadi', async () => {
    await service.getSummary(
      adminOrgA,
      { branchId: 77, courseType: CourseType.ONLINE },
      NOW,
    );

    const scope = {
      organizationId: 10,
      branchId: 77,
      course: { type: CourseType.ONLINE },
    };

    expect(firstWhere(prisma.payment.aggregate).group).toMatchObject(scope);
    expect(firstWhere(prisma.studentGroup.findMany).group).toMatchObject(scope);
    expect(firstWhere(prisma.group.count, 0)).toMatchObject(scope);
    expect(firstWhere(prisma.student.count, 0)).toMatchObject({
      organizationId: 10,
      studentGroups: {
        some: {
          status: Status.ACTIVE,
          group: expect.objectContaining(scope) as unknown,
        },
      },
    });
  });

  it('filtrsiz holatda o‘quvchilar guruh orqali cheklanmaydi', async () => {
    await service.getSummary(adminOrgA, {}, NOW);

    expect(firstWhere(prisma.student.count, 0)).toEqual({
      status: UserStatus.ACTIVE,
      organizationId: 10,
    });
  });

  it('"bugun" Toshkent vaqti bo‘yicha: 9-oktabr 00:00 = UTC 8-oktabr 19:00', async () => {
    await service.getSummary(adminOrgA, {}, NOW);

    expect(firstWhere(prisma.payment.aggregate)).toMatchObject({
      status: PaymentStatus.PAID,
      paidAt: {
        gte: new Date('2026-10-08T19:00:00.000Z'),
        lt: new Date('2026-10-09T19:00:00.000Z'),
      },
    });
    expect(firstWhere(prisma.group.count, 0)).toMatchObject({
      status: Status.ACTIVE,
      weekDays: { has: WeekDays.FRIDAY },
    });
  });

  it('standart oraliq: oy boshi — bugun (oxirgi kun to‘liq kiradi)', async () => {
    await service.getSummary(adminOrgA, {}, NOW);

    expect(firstWhere(prisma.payment.findMany).paidAt).toEqual({
      gte: new Date('2026-09-30T19:00:00.000Z'),
      lt: new Date('2026-10-09T19:00:00.000Z'),
    });
    expect(firstWhere(prisma.student.count, 1).created_at).toEqual({
      gte: new Date('2026-09-30T19:00:00.000Z'),
      lt: new Date('2026-10-09T19:00:00.000Z'),
    });
  });

  it('qarz sana oralig‘iga bog‘liq emas', async () => {
    await service.getSummary(
      adminOrgA,
      { from: '2026-01-01', to: '2026-01-31' },
      NOW,
    );

    expect(firstWhere(prisma.payment.groupBy)).not.toHaveProperty('paidAt');
    expect(firstWhere(prisma.studentGroup.findMany)).not.toHaveProperty(
      'created_at',
    );
  });

  it('natijalarni javobga yig‘adi', async () => {
    prisma.payment.aggregate.mockResolvedValue({
      _sum: { amount: d(250_000) },
    });
    prisma.payment.findMany.mockResolvedValue([
      { paidAt: new Date('2026-10-05T06:00:00.000Z'), amount: d(100) },
      { paidAt: new Date('2026-10-06T06:00:00.000Z'), amount: d(40) },
    ]);
    prisma.studentGroup.findMany.mockResolvedValue([
      {
        studentId: 1,
        groupId: 10,
        group: { course: { price: d(1_000_000) } },
        student: { fullName: 'Ali Valiyev', branch: { name: 'Chilonzor' } },
      },
      {
        studentId: 2,
        groupId: 10,
        group: { course: { price: d(1_000_000) } },
        student: { fullName: 'Vali Aliyev', branch: null },
      },
    ]);
    prisma.payment.groupBy.mockResolvedValue([
      { studentId: 1, groupId: 10, _sum: { amount: d(300_000) } },
      { studentId: 2, groupId: 10, _sum: { amount: d(1_000_000) } },
    ]);
    prisma.student.count.mockResolvedValueOnce(42).mockResolvedValueOnce(5);
    prisma.group.count.mockResolvedValueOnce(6).mockResolvedValueOnce(4);
    prisma.attendance.groupBy.mockResolvedValue([
      { status: AttendanceStatus.PRESENT, _count: { _all: 12 } },
      { status: AttendanceStatus.LATE, _count: { _all: 2 } },
    ]);

    const { data } = await service.getSummary(
      adminOrgA,
      { granularity: 'week' },
      NOW,
    );

    expect(data.todayRevenue).toBe(250_000);
    expect(data.totalDebt).toBe(700_000);
    expect(data.debtorCount).toBe(1);
    expect(data.debtQueue).toEqual([
      {
        studentId: 1,
        fullName: 'Ali Valiyev',
        branchName: 'Chilonzor',
        debt: 700_000,
      },
    ]);
    expect(data.activeStudents).toBe(42);
    expect(data.newStudentsInRange).toBe(5);
    expect(data.today).toEqual({
      scheduledLessons: 6,
      pendingAttendanceLessons: 4,
      attendance: { present: 12, absent: 0, late: 2, excused: 0 },
    });
    expect(data.revenueTrend).toEqual([{ bucket: '2026-10-05', amount: 140 }]);
  });

  describe('noto‘g‘ri sana oralig‘i → 400, bazaga bormaydi', () => {
    const cases: [string, { from?: string; to?: string }][] = [
      ['from > to', { from: '2026-10-09', to: '2026-10-01' }],
      ['366 kundan uzun', { from: '2025-01-01', to: '2026-10-09' }],
      // Review Focus 1
      ['kalendarda yo‘q sana', { from: '2026-02-31', to: '2026-03-05' }],
      ['faqat from, kelajakda', { from: '2026-12-01' }],
    ];

    it.each(cases)('%s', async (_name, query) => {
      await expect(service.getSummary(adminOrgA, query, NOW)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.payment.aggregate).not.toHaveBeenCalled();
    });

    it('aynan 366 kunlik oraliq qabul qilinadi', async () => {
      await expect(
        service.getSummary(
          adminOrgA,
          { from: '2025-10-08', to: '2026-10-09' },
          NOW,
        ),
      ).resolves.toBeDefined();
    });
  });
});
