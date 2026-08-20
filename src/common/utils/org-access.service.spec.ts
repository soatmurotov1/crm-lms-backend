import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role, Status } from '@prisma/client';
import { OrgAccessService } from './org-access.service';
import { orgFilter, belongsToOrg } from './org-scope.util';
import type { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../guard/current-user.decorator';

/**
 * Tashkilotlar orasidagi izolyatsiya.
 *
 * Bu tizim ko'p ijarali (multi-tenant): bitta o'quv markazining admini
 * boshqasining o'quvchilari, guruhlari va baholarini ko'rmasligi kerak.
 * Butun izolyatsiya `OrgAccessService` va `orgFilter` ga tayanadi, shuning
 * uchun aynan shu ikkisi tekshiriladi.
 *
 * Bu yerdagi testlar "so'rov ishladimi" emas, "so'rovda tashkilot sharti
 * BOR-YO'QLIGINI" tekshiradi: shart tushib qolsa, kod baribir ishlaydi —
 * faqat begona ma'lumot ochilib qoladi.
 */

type PrismaMock = {
  group: { findFirst: jest.Mock };
  lesson: { findUnique: jest.Mock };
  homework: { findUnique: jest.Mock };
  exam: { findUnique: jest.Mock };
  student: { findFirst: jest.Mock };
  studentGroup: { findFirst: jest.Mock };
};

function createPrismaMock(): PrismaMock {
  return {
    group: { findFirst: jest.fn() },
    lesson: { findUnique: jest.fn() },
    homework: { findUnique: jest.fn() },
    exam: { findUnique: jest.fn() },
    student: { findFirst: jest.fn() },
    studentGroup: { findFirst: jest.fn() },
  };
}

const superAdmin: RequestUser = {
  id: 1,
  phone: '+998900000001',
  fullName: 'Super Admin',
  role: Role.SUPERADMIN,
  organizationId: null,
};

const adminOrgA: RequestUser = {
  id: 2,
  phone: '+998900000002',
  fullName: 'Admin A',
  role: Role.ADMIN,
  organizationId: 10,
};

const teacherOrgA: RequestUser = {
  id: 3,
  phone: '+998900000003',
  fullName: "O'qituvchi A",
  role: Role.TEACHER,
  organizationId: 10,
};

const studentOrgA: RequestUser = {
  id: 4,
  phone: '+998900000004',
  fullName: "O'quvchi A",
  role: Role.STUDENT,
  organizationId: 10,
};

/**
 * `expect.objectContaining` `any` qaytaradi — ichma-ich ishlatilganda
 * tip tekshiruvi o'chib qoladi. Shuning uchun bir joyda yopib qo'yamiz.
 */
const containing = (shape: Record<string, unknown>): unknown =>
  expect.objectContaining(shape) as unknown;

describe('orgFilter', () => {
  it('SUPERADMIN uchun cheklov qo‘ymaydi', () => {
    expect(orgFilter(superAdmin)).toEqual({});
  });

  it('oddiy xodimni o‘z tashkiloti bilan cheklaydi', () => {
    expect(orgFilter(adminOrgA)).toEqual({ organizationId: 10 });
  });

  /*
    Eng xavfli holat: tashkilotga biriktirilmagan hisob. Agar bu yerda bo'sh
    obyekt qaytsa, filtr butunlay yo'qoladi va bunday hisob HAMMA
    tashkilotning ma'lumotini ko'radi.
  */
  it('tashkilotsiz hisob uchun ham filtrni tushirib qoldirmaydi', () => {
    const orphan: RequestUser = { ...adminOrgA, organizationId: null };

    expect(orgFilter(orphan)).toEqual({ organizationId: null });
    expect(orgFilter(orphan)).not.toEqual({});
  });
});

describe('belongsToOrg', () => {
  it('SUPERADMIN uchun har doim rost', () => {
    expect(belongsToOrg(superAdmin, { organizationId: 99 })).toBe(true);
  });

  it('begona tashkilotning yozuvini rad etadi', () => {
    expect(belongsToOrg(adminOrgA, { organizationId: 99 })).toBe(false);
  });

  it('o‘z tashkilotining yozuvini qabul qiladi', () => {
    expect(belongsToOrg(adminOrgA, { organizationId: 10 })).toBe(true);
  });

  it('yozuv bo‘lmasa rad etadi', () => {
    expect(belongsToOrg(adminOrgA, null)).toBe(false);
  });
});

describe('OrgAccessService', () => {
  let prisma: PrismaMock;
  let service: OrgAccessService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new OrgAccessService(prisma as unknown as PrismaService);
  });

  describe('assertGroupAccess', () => {
    it('so‘rovga tashkilot shartini qo‘shadi', async () => {
      prisma.group.findFirst.mockResolvedValue({ id: 5, teacherId: null });

      await service.assertGroupAccess(adminOrgA, 5);

      expect(prisma.group.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: containing({ id: 5, organizationId: 10 }),
        }),
      );
    });

    it('SUPERADMIN uchun tashkilot shartini qo‘shmaydi', async () => {
      prisma.group.findFirst.mockResolvedValue({ id: 5, teacherId: null });

      await service.assertGroupAccess(superAdmin, 5);

      const [call] = prisma.group.findFirst.mock.calls as [
        { where: Record<string, unknown> },
      ][];

      expect(call[0].where).not.toHaveProperty('organizationId');
    });

    /*
      Begona guruh uchun "Forbidden" emas, "NotFound" qaytadi: aks holda
      javobning o'zi boshqa tashkilotda shunday id borligini oshkor qiladi.
    */
    it('begona tashkilotning guruhi uchun NotFound qaytaradi', async () => {
      prisma.group.findFirst.mockResolvedValue(null);

      await expect(service.assertGroupAccess(adminOrgA, 5)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('o‘qituvchini o‘ziga biriktirilmagan guruhga qo‘ymaydi', async () => {
      // Guruh o'sha tashkilotda, lekin boshqa o'qituvchiniki.
      prisma.group.findFirst.mockResolvedValue({ id: 5, teacherId: 999 });

      await expect(service.assertGroupAccess(teacherOrgA, 5)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('o‘qituvchini o‘z guruhiga qo‘yadi', async () => {
      prisma.group.findFirst.mockResolvedValue({
        id: 5,
        teacherId: teacherOrgA.id,
      });

      await expect(service.assertGroupAccess(teacherOrgA, 5)).resolves.toEqual({
        id: 5,
        teacherId: teacherOrgA.id,
      });
    });

    it('a’zo bo‘lmagan o‘quvchini guruhga qo‘ymaydi', async () => {
      prisma.group.findFirst.mockResolvedValue({ id: 5, teacherId: 7 });
      prisma.studentGroup.findFirst.mockResolvedValue(null);

      await expect(service.assertGroupAccess(studentOrgA, 5)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('faol a’zo o‘quvchini qo‘yadi', async () => {
      prisma.group.findFirst.mockResolvedValue({ id: 5, teacherId: 7 });
      prisma.studentGroup.findFirst.mockResolvedValue({ id: 1 });

      await expect(
        service.assertGroupAccess(studentOrgA, 5),
      ).resolves.toBeDefined();

      // Faqat ACTIVE a'zolik hisobga olinadi: guruhdan chiqarilgan o'quvchi
      // materiallarni ko'rishda davom etmasligi kerak.
      expect(prisma.studentGroup.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: containing({ status: Status.ACTIVE }),
        }),
      );
    });

    it('requireActive bilan arxivlangan guruhga yozuv qo‘shtirmaydi', async () => {
      prisma.group.findFirst.mockResolvedValue({ id: 5, teacherId: null });

      await service.assertGroupAccess(adminOrgA, 5, { requireActive: true });

      expect(prisma.group.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: containing({ status: Status.ACTIVE }),
        }),
      );
    });
  });

  describe('assertStudentAccess', () => {
    it('o‘quvchini begona o‘quvchi ma’lumotiga qo‘ymaydi', async () => {
      await expect(
        service.assertStudentAccess(studentOrgA, studentOrgA.id + 1),
      ).rejects.toThrow(ForbiddenException);

      // Bazaga umuman bormasligi kerak — tekshiruv id darajasida hal bo'ladi.
      expect(prisma.student.findFirst).not.toHaveBeenCalled();
    });

    it('o‘quvchini o‘z ma’lumotiga qo‘yadi', async () => {
      await expect(
        service.assertStudentAccess(studentOrgA, studentOrgA.id),
      ).resolves.toBeUndefined();
    });

    it('xodim uchun tashkilot shartini qo‘shadi', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 77 });

      await service.assertStudentAccess(adminOrgA, 77);

      expect(prisma.student.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: containing({ id: 77, organizationId: 10 }),
        }),
      );
    });

    it('begona tashkilot o‘quvchisi uchun NotFound qaytaradi', async () => {
      prisma.student.findFirst.mockResolvedValue(null);

      await expect(service.assertStudentAccess(adminOrgA, 77)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('o‘qituvchini o‘z guruhida bo‘lmagan o‘quvchiga qo‘ymaydi', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 77 });
      prisma.studentGroup.findFirst.mockResolvedValue(null);

      await expect(
        service.assertStudentAccess(teacherOrgA, 77),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('bog‘liq yozuvlar guruh orqali tekshiriladi', () => {
    it('dars — o‘z guruhi orqali', async () => {
      prisma.lesson.findUnique.mockResolvedValue({ id: 8, groupId: 5 });
      prisma.group.findFirst.mockResolvedValue(null);

      await expect(service.assertLessonAccess(adminOrgA, 8)).rejects.toThrow(
        NotFoundException,
      );

      expect(prisma.group.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: containing({ id: 5, organizationId: 10 }),
        }),
      );
    });

    it('uy vazifa — o‘z guruhi orqali', async () => {
      prisma.homework.findUnique.mockResolvedValue({
        id: 9,
        groupId: 5,
        lessonId: 8,
      });
      prisma.group.findFirst.mockResolvedValue(null);

      await expect(service.assertHomeworkAccess(adminOrgA, 9)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('imtihon — o‘z guruhi orqali', async () => {
      prisma.exam.findUnique.mockResolvedValue({ id: 10, groupId: 5 });
      prisma.group.findFirst.mockResolvedValue(null);

      await expect(service.assertExamAccess(adminOrgA, 10)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
