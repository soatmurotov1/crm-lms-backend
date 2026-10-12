import { Role } from '@prisma/client';
import { StudentsService } from './students.service';
import type { PrismaService } from 'src/common/prisma/prisma.service';
import type { CloudinaryService } from 'src/common/cloudinary/cloudinary.service';
import type { VerificationService } from 'src/modules/auth/verification.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';

const admin: RequestUser = {
  id: 2,
  phone: '+998900000002',
  fullName: 'Admin A',
  role: Role.ADMIN,
  organizationId: 10,
};

describe('StudentsService.getAllStudents: qidiruv', () => {
  let findMany: jest.Mock;
  let count: jest.Mock;
  let service: StudentsService;

  const whereOf = () =>
    (findMany.mock.calls[0] as [{ where: Record<string, unknown> }])[0].where;

  beforeEach(() => {
    findMany = jest.fn().mockReturnValue('findMany');
    count = jest.fn().mockReturnValue('count');
    service = new StudentsService(
      {
        student: { findMany, count },
        $transaction: jest.fn().mockResolvedValue([[], 0]),
      } as unknown as PrismaService,
      {} as CloudinaryService,
      {} as VerificationService,
    );
  });

  it('qidiruvsiz — faqat tashkilot sharti (eski xatti-harakat)', async () => {
    await service.getAllStudents(admin, {});

    expect(whereOf()).toEqual({ organizationId: 10 });
  });

  it('ism yoki telefon bo‘yicha, tashkilot sharti saqlanadi', async () => {
    await service.getAllStudents(admin, { search: 'ali' });

    expect(whereOf()).toEqual({
      organizationId: 10,
      OR: [
        { fullName: { contains: 'ali', mode: 'insensitive' } },
        { phone: { contains: 'ali' } },
      ],
    });
    // Sanash ham xuddi shu filtr bilan — aks holda `meta.total` noto'g'ri.
    expect(count).toHaveBeenCalledWith({ where: whereOf() });
  });

  it('telefon bo‘yicha qidiruvda bo‘shliq, qavs va chiziqcha olib tashlanadi', async () => {
    await service.getAllStudents(admin, { search: '(90) 123-45 67' });

    expect((whereOf().OR as unknown[])[1]).toEqual({
      phone: { contains: '901234567' },
    });
  });
});
