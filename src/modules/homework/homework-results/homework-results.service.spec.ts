import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { HomeworkResultsService } from './homework-results.service';
import type { PrismaService } from 'src/common/prisma/prisma.service';
import type { OrgAccessService } from 'src/common/utils/org-access.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';

/**
 * Uy vazifa natijalari — tashkilotlar orasidagi chegara.
 *
 * Bu yerdagi asosiy test regressiya testi: yangilashda ruxsat SO'ROVDA
 * KELGAN `homeworkId` bo'yicha emas, YANGILANAYOTGAN yozuv bo'yicha
 * tekshirilishi kerak.
 *
 * Ilgari faqat `payload.homeworkId` tekshirilardi. Natijada bir
 * tashkilotning o'qituvchisi `id` maydoniga begona natijaning raqamini,
 * `homeworkId` ga esa o'zining vazifasini yozib yuborsa, tekshiruv o'zining
 * vazifasidan o'tar va `update` begona yozuvni o'zgartirib, uni o'z guruhiga
 * bog'lab qo'yardi.
 */

type PrismaMock = {
  homework: { findUnique: jest.Mock };
  homeworkResult: { findUnique: jest.Mock; update: jest.Mock };
  homeworkResponse: { findFirst: jest.Mock };
};

const teacher: RequestUser = {
  id: 3,
  phone: '+998900000003',
  fullName: "O'qituvchi",
  role: Role.TEACHER,
  organizationId: 10,
};

/** O'qituvchining o'z tashkilotidagi vazifasi. */
const OWN_HOMEWORK_ID = 100;
/** Boshqa tashkilotdagi vazifa. */
const FOREIGN_HOMEWORK_ID = 900;

describe('HomeworkResultsService.updateHomeworkResult', () => {
  let prisma: PrismaMock;
  let orgAccess: { assertHomeworkAccess: jest.Mock };
  let service: HomeworkResultsService;

  beforeEach(() => {
    prisma = {
      homework: { findUnique: jest.fn() },
      homeworkResult: { findUnique: jest.fn(), update: jest.fn() },
      homeworkResponse: { findFirst: jest.fn() },
    };

    orgAccess = {
      // Faqat o'z tashkilotining vazifasiga ruxsat beradigan soxta tekshiruv.
      assertHomeworkAccess: jest.fn((_user: RequestUser, id: number) =>
        id === OWN_HOMEWORK_ID
          ? Promise.resolve({ id, groupId: 5, lessonId: 8 })
          : Promise.reject(
              new ForbiddenException('Boshqa tashkilotning vazifasi'),
            ),
      ),
    };

    service = new HomeworkResultsService(
      prisma as unknown as PrismaService,
      orgAccess as unknown as OrgAccessService,
    );
  });

  it('begona natijani o‘z vazifasiga ko‘chirishga yo‘l qo‘ymaydi', async () => {
    // Boshqa tashkilotning natijasi.
    prisma.homeworkResult.findUnique.mockResolvedValue({
      id: 555,
      homeworkId: FOREIGN_HOMEWORK_ID,
      studentId: 77,
    });

    await expect(
      service.updateHomeworkResult(
        {
          id: 555,
          // O'zining vazifasi — tekshiruvni chalg'itish uchun.
          homeworkId: OWN_HOMEWORK_ID,
          studentId: 77,
          title: 'Yangi baho',
          score: 100,
        },
        teacher,
      ),
    ).rejects.toThrow(BadRequestException);

    // Eng muhimi: begona yozuv o'zgarmagan bo'lishi kerak.
    expect(prisma.homeworkResult.update).not.toHaveBeenCalled();
  });

  it('ruxsatni yangilanayotgan yozuvning vazifasi bo‘yicha tekshiradi', async () => {
    prisma.homeworkResult.findUnique.mockResolvedValue({
      id: 556,
      homeworkId: FOREIGN_HOMEWORK_ID,
      studentId: 77,
    });

    await expect(
      service.updateHomeworkResult(
        {
          id: 556,
          homeworkId: FOREIGN_HOMEWORK_ID,
          studentId: 77,
          title: 'Yangi baho',
          score: 100,
        },
        teacher,
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(orgAccess.assertHomeworkAccess).toHaveBeenCalledWith(
      teacher,
      FOREIGN_HOMEWORK_ID,
    );
    expect(prisma.homeworkResult.update).not.toHaveBeenCalled();
  });

  it('o‘z tashkilotidagi natijani yangilashga ruxsat beradi', async () => {
    prisma.homeworkResult.findUnique.mockResolvedValue({
      id: 557,
      homeworkId: OWN_HOMEWORK_ID,
      studentId: 77,
    });
    prisma.homework.findUnique.mockResolvedValue({ id: OWN_HOMEWORK_ID });
    prisma.homeworkResponse.findFirst.mockResolvedValue({ id: 1 });
    prisma.homeworkResult.update.mockResolvedValue({ id: 557 });

    await expect(
      service.updateHomeworkResult(
        {
          id: 557,
          homeworkId: OWN_HOMEWORK_ID,
          studentId: 77,
          title: 'Yangi baho',
          score: 90,
        },
        teacher,
      ),
    ).resolves.toEqual(expect.objectContaining({ success: true }));

    expect(prisma.homeworkResult.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 557 } }),
    );
  });

  it('o‘quvchi vazifani topshirmagan bo‘lsa baho qo‘ymaydi', async () => {
    prisma.homeworkResult.findUnique.mockResolvedValue({
      id: 558,
      homeworkId: OWN_HOMEWORK_ID,
      studentId: 77,
    });
    prisma.homework.findUnique.mockResolvedValue({ id: OWN_HOMEWORK_ID });
    prisma.homeworkResponse.findFirst.mockResolvedValue(null);

    await expect(
      service.updateHomeworkResult(
        {
          id: 558,
          homeworkId: OWN_HOMEWORK_ID,
          studentId: 77,
          title: 'Baho',
          score: 90,
        },
        teacher,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.homeworkResult.update).not.toHaveBeenCalled();
  });
});
