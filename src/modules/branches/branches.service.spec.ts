import { Role, Status } from '@prisma/client';
import { BranchesService } from './branches.service';
import type { PrismaService } from 'src/common/prisma/prisma.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';

const admin: RequestUser = {
  id: 2,
  phone: '+998900000002',
  fullName: 'Admin A',
  role: Role.ADMIN,
  organizationId: 10,
};

describe('BranchesService.list', () => {
  let findMany: jest.Mock;
  let service: BranchesService;

  beforeEach(() => {
    findMany = jest.fn().mockResolvedValue([]);
    service = new BranchesService({
      branch: { findMany },
    } as unknown as PrismaService);
  });

  it('faqat o‘z tashkilotining faol filiallarini so‘raydi', async () => {
    const rows = [{ id: 1, name: 'Asosiy filial', status: Status.ACTIVE }];
    findMany.mockResolvedValue(rows);

    await expect(service.list(admin)).resolves.toEqual({
      success: true,
      data: rows,
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { status: Status.ACTIVE, organizationId: 10 },
      select: { id: true, name: true, status: true },
      orderBy: { id: 'asc' },
    });
  });

  it('SUPERADMIN uchun tashkilot sharti yo‘q', async () => {
    await service.list({ ...admin, role: Role.SUPERADMIN, organizationId: null });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: Status.ACTIVE } }),
    );
  });

  // Review Focus 3
  it('tashkilotsiz xodimga bo‘sh ro‘yxat, bazaga bormaydi', async () => {
    await expect(
      service.list({ ...admin, organizationId: null }),
    ).resolves.toEqual({ success: true, data: [] });
    expect(findMany).not.toHaveBeenCalled();
  });
});
