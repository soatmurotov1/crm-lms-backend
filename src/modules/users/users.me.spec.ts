import { ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Role, Status } from '@prisma/client';
import { UsersService } from './users.service';
import { UpdateMeDto } from './dto/update-me.dto';
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

const profile = {
  id: 2,
  fullName: 'Admin A',
  phone: '+998900000002',
  email: null,
  role: Role.ADMIN,
  photo: null,
  organization: { id: 10, name: 'Markaz A', status: Status.ACTIVE },
};

const ME_SELECT = {
  id: true,
  fullName: true,
  phone: true,
  email: true,
  role: true,
  photo: true,
  organization: { select: { id: true, name: true, status: true } },
};

describe('UsersService: o‘z profili', () => {
  let user: { findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  let service: UsersService;

  beforeEach(() => {
    user = {
      findUnique: jest.fn().mockResolvedValue(profile),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(profile),
    };
    service = new UsersService(
      { user } as unknown as PrismaService,
      {} as CloudinaryService,
      {} as VerificationService,
    );
  });

  it('getMe: tokendagi id bo‘yicha, parolsiz', async () => {
    await expect(service.getMe(admin)).resolves.toEqual({
      success: true,
      data: profile,
    });
    expect(user.findUnique).toHaveBeenCalledWith({
      where: { id: 2 },
      select: ME_SELECT,
    });
  });

  it('getMe: hisob o‘chirilgan bo‘lsa NotFound', async () => {
    user.findUnique.mockResolvedValue(null);

    await expect(service.getMe(admin)).rejects.toThrow(NotFoundException);
  });

  it('updateMe: faqat berilgan maydonlarni yangilaydi', async () => {
    await service.updateMe(admin, { fullName: 'Yangi Ism' });

    expect(user.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { fullName: 'Yangi Ism' },
      select: ME_SELECT,
    });
    // Email berilmagan — bandlik tekshiruvi ham kerak emas.
    expect(user.findFirst).not.toHaveBeenCalled();
  });

  // Review Focus 5
  it('updateMe: boshqa xodimning emaili — 409, yozuv o‘zgarmaydi', async () => {
    user.findFirst.mockResolvedValue({ id: 99 });

    await expect(
      service.updateMe(admin, { email: 'band@example.com' }),
    ).rejects.toThrow(ConflictException);
    expect(user.findFirst).toHaveBeenCalledWith({
      where: { email: 'band@example.com', id: { not: 2 } },
      select: { id: true },
    });
    expect(user.update).not.toHaveBeenCalled();
  });

  it('updateMe: email null — tozalaydi, bandlik tekshirilmaydi', async () => {
    await service.updateMe(admin, { email: null });

    expect(user.findFirst).not.toHaveBeenCalled();
    expect(user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { email: null } }),
    );
  });
});

describe('UpdateMeDto', () => {
  const check = async (payload: Record<string, unknown>) => {
    const dto = plainToInstance(UpdateMeDto, payload);
    return { dto, errors: await validate(dto) };
  };

  it('emailni kichik harfga keltiradi va bo‘shliqni kesadi', async () => {
    const { dto, errors } = await check({ email: '  Admin@Example.COM ' });

    expect(errors).toHaveLength(0);
    expect(dto.email).toBe('admin@example.com');
  });

  it('bo‘sh email — null', async () => {
    const { dto, errors } = await check({ email: '   ' });

    expect(errors).toHaveLength(0);
    expect(dto.email).toBeNull();
  });

  it('noto‘g‘ri email va juda qisqa ismni rad etadi', async () => {
    expect((await check({ email: 'not-an-email' })).errors).toHaveLength(1);
    expect((await check({ fullName: ' a ' })).errors).toHaveLength(1);
  });

  it('bo‘sh tana — xato emas', async () => {
    expect((await check({})).errors).toHaveLength(0);
  });
});
