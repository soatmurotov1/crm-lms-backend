import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import { AuthGuard } from './jwt-auth.guard';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../prisma/prisma.service';
import type { SessionService } from '../session/session.service';
import type { AuthedRequest } from './current-user.decorator';

/**
 * Kirish nazorati.
 *
 * Guard'ning vazifasi tokenning imzosini tekshirish bilan tugamaydi. Token
 * imzolangandan keyin uni chaqirib olib bo'lmaydi, shuning uchun har bir
 * so'rovda yana uchta narsa tekshiriladi:
 *
 *  1. tokenda sessiya raqami (`sid`) bormi va u hali ochiqmi — "chiqish"
 *     va "hamma qurilmadan chiqarish" shu orqali ishlaydi;
 *  2. sessiya aynan shu hisobga tegishlimi;
 *  3. hisob hali ham faolmi va uning ROLI qanaqa — rol va tashkilot doim
 *     bazadan olinadi, tokenda yozilganiga ishonilmaydi.
 *
 * Uchinchisi eng muhimi: aks holda roli pasaytirilgan yoki boshqa
 * tashkilotga ko'chirilgan foydalanuvchi eski huquqlari bilan token muddati
 * tugagunicha ishlashda davom etardi.
 */

function createContext(authorization?: string) {
  const request = { headers: { authorization } } as unknown as AuthedRequest;

  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { context, request };
}

describe('AuthGuard', () => {
  let jwt: { verifyAsync: jest.Mock };
  let prisma: {
    user: { findUnique: jest.Mock };
    student: { findUnique: jest.Mock };
    teacher: { findUnique: jest.Mock };
  };
  let sessions: { getActiveSession: jest.Mock };
  let guard: AuthGuard;

  const validPayload = {
    id: 7,
    phone: '+998900000007',
    fullName: 'Test User',
    role: Role.ADMIN,
    sid: 'session-1',
  };

  beforeEach(() => {
    jwt = { verifyAsync: jest.fn().mockResolvedValue(validPayload) };
    prisma = {
      user: { findUnique: jest.fn() },
      student: { findUnique: jest.fn() },
      teacher: { findUnique: jest.fn() },
    };
    sessions = { getActiveSession: jest.fn() };

    guard = new AuthGuard(
      jwt as unknown as JwtService,
      prisma as unknown as PrismaService,
      sessions as unknown as SessionService,
    );
  });

  it('Authorization sarlavhasisiz rad etadi', async () => {
    const { context } = createContext(undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('Bearer bo‘lmagan sxemani rad etadi', async () => {
    const { context } = createContext('Basic abc123');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('imzosi yaroqsiz tokenni rad etadi', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('invalid signature'));
    const { context } = createContext('Bearer bad-token');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  /*
    `sid` siz token — bu sessiya mexanizmi joriy qilinishidan oldin berilgan
    eski token. Uni bekor qilishning iloji yo'q, shuning uchun qabul
    qilinmaydi.
  */
  it('sid maydonisiz eski tokenni rad etadi', async () => {
    jwt.verifyAsync.mockResolvedValue({ ...validPayload, sid: undefined });
    const { context } = createContext('Bearer old-token');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('sessiya yopilgan bo‘lsa rad etadi (chiqish ishlashi)', async () => {
    sessions.getActiveSession.mockResolvedValue(null);
    const { context } = createContext('Bearer token');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('sessiya boshqa hisobga tegishli bo‘lsa rad etadi', async () => {
    sessions.getActiveSession.mockResolvedValue({
      userId: validPayload.id + 1,
      userType: 'user',
    });
    const { context } = createContext('Bearer token');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('hisob o‘chirilgan bo‘lsa rad etadi', async () => {
    sessions.getActiveSession.mockResolvedValue({
      userId: validPayload.id,
      userType: 'user',
    });
    prisma.user.findUnique.mockResolvedValue(null);
    const { context } = createContext('Bearer token');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('hisob faol bo‘lmasa rad etadi', async () => {
    sessions.getActiveSession.mockResolvedValue({
      userId: validPayload.id,
      userType: 'user',
    });
    prisma.user.findUnique.mockResolvedValue({
      status: UserStatus.INACTIVE,
      role: Role.ADMIN,
      organizationId: 10,
    });
    const { context } = createContext('Bearer token');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  /*
    Bu eng muhim tekshiruv: tokenda ADMIN yozilgan bo'lsa ham, bazada rol
    pasaytirilgan bo'lsa so'rovga BAZADAGI rol biriktiriladi.
  */
  it('rol va tashkilotni tokendan emas, bazadan oladi', async () => {
    sessions.getActiveSession.mockResolvedValue({
      userId: validPayload.id,
      userType: 'user',
    });
    prisma.user.findUnique.mockResolvedValue({
      status: UserStatus.ACTIVE,
      role: Role.ADMINSTRATOR,
      organizationId: 42,
    });

    const { context, request } = createContext('Bearer token');

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(request.user).toEqual(
      expect.objectContaining({
        id: validPayload.id,
        role: Role.ADMINSTRATOR,
        organizationId: 42,
      }),
    );
    expect(request.user?.role).not.toBe(validPayload.role);
  });

  /*
    Hisoblar uch xil jadvalda va ID hisoblagichlari alohida: 7-raqamli
    o'quvchi ham, 7-raqamli o'qituvchi ham bo'lishi mumkin. Shuning uchun
    jadvalni SESSIYA aytadi, tokendagi rol emas.
  */
  it('jadvalni sessiyadagi userType bo‘yicha tanlaydi', async () => {
    sessions.getActiveSession.mockResolvedValue({
      userId: validPayload.id,
      userType: 'student',
    });
    prisma.student.findUnique.mockResolvedValue({
      status: UserStatus.ACTIVE,
      organizationId: 10,
    });

    const { context, request } = createContext('Bearer token');

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(prisma.student.findUnique).toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(request.user?.role).toBe(Role.STUDENT);
  });

  /*
    `User` jadvalidagi hisobda TEACHER/STUDENT roli turishi — ma'lumot
    xatosi: uning ID si Teacher jadvaliga tegishli emas, lekin rol bo'yicha
    o'qituvchi endpointlariga kirar edi. Ochiq qoldirgandan ko'ra to'xtatgan
    xavfsizroq.
  */
  it('User jadvalidagi TEACHER rolli hisobni rad etadi', async () => {
    sessions.getActiveSession.mockResolvedValue({
      userId: validPayload.id,
      userType: 'user',
    });
    prisma.user.findUnique.mockResolvedValue({
      status: UserStatus.ACTIVE,
      role: Role.TEACHER,
      organizationId: 10,
    });

    const { context } = createContext('Bearer token');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
