import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { Role, Status, UserStatus } from '@prisma/client';
import { hashPassword } from 'src/common/bcrypt/bcrypt';
import type { PrismaService } from 'src/common/prisma/prisma.service';
import type { SessionService } from 'src/common/session/session.service';
import { V2AuthService } from './v2-auth.service';

const EXPIRES_AT = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

async function setup(overrides: Record<string, unknown> = {}) {
  const account = {
    id: 5,
    fullName: 'Admin A',
    email: 'admin@example.com',
    phone: '+998900000001',
    photo: null,
    password: await hashPassword('Secret123'),
    role: Role.ADMIN,
    status: UserStatus.ACTIVE,
    organizationId: 10,
    created_at: new Date('2026-01-01T00:00:00Z'),
    crmTourCompletedAt: null,
    organization: { id: 10, status: Status.ACTIVE },
    managedBranches: [],
    branchId: null,
    accessVersion: 0,
    permissions: null,
    deleted_at: null,
    ...overrides,
  };

  const prisma = {
    user: {
      findFirst: jest.fn().mockResolvedValue(account),
      findUnique: jest.fn().mockResolvedValue(account),
      update: jest.fn().mockResolvedValue(account),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    branch: {
      findMany: jest.fn().mockResolvedValue([
        { id: 1, name: 'Asosiy filial' },
        { id: 2, name: 'Chilonzor' },
      ]),
    },
    teacher: { findFirst: jest.fn().mockResolvedValue(null) },
    loginLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const jwt = {
    sign: jest.fn().mockReturnValue('signed.jwt'),
    verify: jest.fn(),
  };
  const sessions = {
    createSession: jest
      .fn()
      .mockResolvedValue({ sessionId: 'sid-1', expiresAt: EXPIRES_AT }),
    revokeSession: jest.fn(),
    revokeAllForAccount: jest.fn().mockResolvedValue(2),
  };

  const service = new V2AuthService(
    prisma as unknown as PrismaService,
    jwt as unknown as JwtService,
    sessions as unknown as SessionService,
  );

  return { service, prisma, jwt, sessions };
}

describe('V2AuthService.login', () => {
  it('to‘g‘ri email va parol — token va frontend shaklidagi foydalanuvchi', async () => {
    const { service, jwt, sessions } = await setup();

    const result = await service.login({
      email: 'admin@example.com',
      password: 'Secret123',
    });

    expect(result.token).toBe('signed.jwt');
    expect(result.expiresAt).toBe(EXPIRES_AT);
    expect(result.user).toMatchObject({
      id: '5',
      name: 'Admin A',
      email: 'admin@example.com',
      role: 'owner',
      // Egasi "Barcha filiallar" ko'rinishida boshlaydi.
      branch_id: null,
      branch_ids: ['1', '2'],
      company_id: '10',
      company_status: 'active',
      crm_tour_completed_at: null,
    });
    expect(sessions.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 5, userType: 'user' }),
    );
    // Token sessiyaga bog'lanadi — bekor qilish shu orqali ishlaydi.
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ id: 5, sid: 'sid-1' }),
      expect.objectContaining({ expiresIn: expect.any(Number) as unknown }),
    );
  });

  it('menejer o‘zi boshqaradigan filialdan boshlaydi', async () => {
    const { service } = await setup({
      role: Role.MANAGEMENT,
      managedBranches: [{ id: 2 }],
    });

    const { user } = await service.login({
      email: 'admin@example.com',
      password: 'Secret123',
    });

    expect(user.role).toBe('manager');
    expect(user.branch_id).toBe('2');
    expect(user.branch_name).toBe('Chilonzor');
    expect(user.branch_ids).toEqual(['2', '1']);
  });

  it('parol xato — 401, urinish logga yoziladi, sessiya ochilmaydi', async () => {
    const { service, prisma, sessions } = await setup();

    await expect(
      service.login({ email: 'admin@example.com', password: 'wrong' }),
    ).rejects.toThrow(UnauthorizedException);

    expect(prisma.loginLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        success: false,
        organizationId: 10,
      }) as unknown,
    });
    expect(sessions.createSession).not.toHaveBeenCalled();
  });

  it('hisob topilmasa ham xuddi shu xato', async () => {
    const { service, prisma } = await setup();
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.login({ email: 'nobody@example.com', password: 'Secret123' }),
    ).rejects.toThrow('Email yoki parol xato');
  });

  it('muzlatilgan hisob to‘g‘ri parol bilan ham kira olmaydi', async () => {
    const { service, sessions } = await setup({ status: UserStatus.FREEZE });

    await expect(
      service.login({ email: 'admin@example.com', password: 'Secret123' }),
    ).rejects.toThrow(ForbiddenException);
    expect(sessions.createSession).not.toHaveBeenCalled();
  });

  it('User jadvalidagi o‘qituvchi/o‘quvchi roli bu panelga kirmaydi', async () => {
    const { service } = await setup({ role: Role.TEACHER });

    await expect(
      service.login({ email: 'admin@example.com', password: 'Secret123' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});

describe('V2AuthService.changePassword', () => {
  it('joriy parol xato bo‘lsa hech narsa o‘zgarmaydi', async () => {
    const { service, prisma, sessions } = await setup();

    await expect(
      service.changePassword({ kind: 'user', id: 5 }, {
        currentPassword: 'wrong',
        newPassword: 'NewSecret1',
      }),
    ).rejects.toThrow('Joriy parol noto‘g‘ri');

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(sessions.revokeAllForAccount).not.toHaveBeenCalled();
  });

  it('hamma sessiyani yopadi va shu qurilma uchun yangisini ochadi', async () => {
    const { service, prisma, sessions } = await setup();

    const result = await service.changePassword({ kind: 'user', id: 5 }, {
      currentPassword: 'Secret123',
      newPassword: 'NewSecret1',
    });

    expect(prisma.user.update).toHaveBeenCalled();
    expect(sessions.revokeAllForAccount).toHaveBeenCalledWith(5, 'user');
    expect(sessions.createSession).toHaveBeenCalledTimes(1);
    expect(result.token).toBe('signed.jwt');
  });
});

describe('V2AuthService.logout', () => {
  it('token ichidagi sessiyani yopadi', async () => {
    const { service, jwt, sessions } = await setup();
    jwt.verify.mockReturnValue({ sid: 'sid-9' });

    await service.logout('some.jwt');

    expect(jwt.verify).toHaveBeenCalledWith('some.jwt', {
      ignoreExpiration: true,
    });
    expect(sessions.revokeSession).toHaveBeenCalledWith('sid-9');
  });

  it('imzosi noto‘g‘ri token jimgina e‘tiborsiz qoldiriladi', async () => {
    const { service, jwt, sessions } = await setup();
    jwt.verify.mockImplementation(() => {
      throw new Error('invalid signature');
    });

    await expect(service.logout('forged.jwt')).resolves.toBeUndefined();
    expect(sessions.revokeSession).not.toHaveBeenCalled();
  });
});
