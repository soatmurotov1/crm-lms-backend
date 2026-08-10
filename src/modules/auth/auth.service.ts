import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtService } from '@nestjs/jwt';
import { comparePassword, hashPassword } from 'src/common/bcrypt/bcrypt';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { Role, UserStatus, VerificationPurpose } from '@prisma/client';
import { normalizePhone } from 'src/common/utils/phone.util';
import { VerificationService } from './verification.service';
import { SessionService } from 'src/common/session/session.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import { isSuperAdmin } from 'src/common/utils/org-scope.util';

/** Bitta telefon raqami uchta jadvaldan birida bo'lishi mumkin. */
type AccountKind = 'user' | 'teacher' | 'student';

/** So'rov haqidagi ma'lumot: log uchun ham, sessiya uchun ham kerak. */
export interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
}

/** Tokenga yoziladigan ma'lumot. `sid` sessiyani bekor qilish uchun. */
interface TokenPayload {
  id: number;
  phone: string;
  role: Role;
  fullName: string;
  sid: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private verificationService: VerificationService,
    private sessionService: SessionService,
  ) {}

  private generateToken(payload: TokenPayload): string {
    return this.jwtService.sign(payload);
  }

  /** Rol qaysi jadvalga tegishli ekanini aytadi. */
  private accountKindForRole(role: Role): AccountKind {
    if (role === Role.STUDENT) return 'student';
    if (role === Role.TEACHER) return 'teacher';
    return 'user';
  }

  /**
   * Login muvaffaqiyatli tugagandan keyingi umumiy qadam: sessiya ochiladi,
   * access token unga bog'lanadi va refresh token bilan birga qaytariladi.
   */
  private async issueTokens(
    account: { id: number; phone: string; role: Role; fullName: string },
    userType: AccountKind,
    context: RequestContext,
  ) {
    const session = await this.sessionService.createSession({
      userId: account.id,
      userType,
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
    });

    const accessToken = this.generateToken({
      id: account.id,
      phone: account.phone,
      role: account.role,
      fullName: account.fullName,
      sid: session.sessionId,
    });

    return {
      accessToken,
      refreshToken: session.refreshToken,
      refreshTokenExpiresAt: session.expiresAt.toISOString(),
    };
  }

  /**
   * Bloklangan yoki muzlatilgan hisob tizimga kira olmasligi kerak. Parol
   * to'g'ri bo'lsa ham to'xtatamiz, aks holda "o'chirilgan" xodim eski paroli
   * bilan ishlashda davom etaveradi.
   */
  private async ensureAccountIsActive(
    status: UserStatus,
    phone: string,
    context: RequestContext,
    loginType: AccountKind,
    organizationId: number | null = null,
  ) {
    if (status === UserStatus.ACTIVE) return;

    // To'g'ri parol bilan kelgan, lekin bloklangan hisob - bu ham
    // tekshirilishi kerak bo'lgan holat, shuning uchun logga tushadi.
    await this.logFailedLogin(phone, context, loginType, organizationId);

    throw new BadRequestException(
      status === UserStatus.FREEZE
        ? 'Hisobingiz vaqtincha muzlatilgan. Administratorga murojaat qiling'
        : 'Hisobingiz faol emas. Administratorga murojaat qiling',
    );
  }

  private async logLogin(
    phone: string,
    context: RequestContext,
    loginType: string = 'user',
    success: boolean = true,
    organizationId: number | null = null,
  ): Promise<void> {
    try {
      await this.prisma.loginLog.create({
        data: {
          userPhone: phone,
          ipAddress: context.ipAddress || '',
          userAgent: context.userAgent?.slice(0, 255) || null,
          loginType,
          success,
          organizationId,
        },
      });
    } catch (error) {
      console.error('Login logging xatosi:', error);
    }
  }

  /**
   * Muvaffaqiyatsiz urinishni yozadi.
   *
   * Faqat raqam SHU jadvalda topilgan holatlarda chaqiriladi (parol xato yoki
   * hisob bloklangan). Sababi: sayt kim kirayotganini bilmaydi va
   * admin -> o'qituvchi -> o'quvchi tartibida sinab ko'radi, ya'ni har bir
   * oddiy o'quvchi login'i ikkita "topilmadi" xatosi qoldirardi. Bunday
   * shovqin ichida haqiqiy brute-force ko'rinmay qolardi.
   */
  private async logFailedLogin(
    phone: string,
    context: RequestContext,
    loginType: string,
    organizationId: number | null = null,
  ): Promise<void> {
    await this.logLogin(phone, context, loginType, false, organizationId);
  }

  /**
   * Kirish urinishlari tarixi — xavfsizlik bo'limi uchun.
   *
   * Tashkilot admini faqat o'z tashkilotining urinishlarini ko'radi.
   * SUPERADMIN hammasini ko'radi (shu jumladan tashkilotsiz eski qatorlarni).
   */
  async loginAttempts(
    user: RequestUser,
    query: { phone?: string; onlyFailed?: boolean; limit?: number },
  ) {
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
    const phone = query.phone ? normalizePhone(query.phone) : undefined;

    const where = {
      ...(isSuperAdmin(user)
        ? {}
        : { organizationId: user?.organizationId ?? null }),
      ...(phone ? { userPhone: phone } : {}),
      ...(query.onlyFailed ? { success: false } : {}),
    };

    const [attempts, failedLastDay] = await Promise.all([
      this.prisma.loginLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: limit,
      }),
      this.prisma.loginLog.count({
        where: {
          ...where,
          success: false,
          created_at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    return {
      success: true,
      // Bir kunlik muvaffaqiyatsiz urinishlar soni - brute-force belgisi
      // ro'yxatni varaqlamasdan ko'rinib tursin.
      failedLastDay,
      data: attempts,
    };
  }

  /**
   * Ochiq ro'yxatdan o'tish - yangi hisob doim STUDENT bo'lib ochiladi va
   * foydalanuvchi darhol tizimga kiritiladi.
   */
  async register(payload: RegisterDto, context: RequestContext = {}) {
    const phone = normalizePhone(payload.phone);

    if (phone === normalizePhone(process.env.SUPERADMIN_PHONE)) {
      throw new ConflictException(
        "Bu telefon raqami allaqachon ro'yxatdan o'tgan",
      );
    }

    // Raqam uchala jadvalda ham band bo'lmasligi kerak, aks holda login
    // qaysi hisobga tegishli ekani noaniq bo'lib qoladi.
    const existing = await this.findAccountByPhone(phone);
    if (existing) {
      throw new ConflictException(
        "Bu telefon raqami allaqachon ro'yxatdan o'tgan. Tizimga kiring yoki parolni tiklang",
      );
    }

    const birthDate = new Date(payload.birth_date);
    if (Number.isNaN(birthDate.getTime())) {
      throw new BadRequestException("Tug'ilgan sana noto'g'ri");
    }

    if (birthDate.getTime() > Date.now()) {
      throw new BadRequestException(
        "Tug'ilgan sana bugungi kundan keyin bo'lishi mumkin emas",
      );
    }

    // Raqam haqiqatan ham foydalanuvchiniki ekanini SMS kod bilan tasdiqlaymiz.
    // Boshqa tekshiruvlardan keyin turadi: xato forma kodni behuda sarflamasin.
    await this.verificationService.verifyAndConsume(
      phone,
      payload.code,
      VerificationPurpose.REGISTER,
    );

    const student = await this.prisma.student.create({
      data: {
        fullName: payload.fullName.trim(),
        phone,
        password: await hashPassword(payload.password),
        birth_date: birthDate,
      },
    });

    await this.logLogin(
      student.phone,
      context,
      'student',
      true,
      student.organizationId,
    );

    const tokens = await this.issueTokens(
      {
        id: student.id,
        phone: student.phone,
        role: Role.STUDENT,
        fullName: student.fullName,
      },
      'student',
      context,
    );

    return {
      success: true,
      message: "Ro'yxatdan o'tdingiz",
      ...tokens,
      access_token: tokens.accessToken,
      user: {
        id: student.id,
        phone: student.phone,
        fullName: student.fullName,
        role: Role.STUDENT,
      },
    };
  }

  async login(payload: LoginDto, context: RequestContext = {}) {
    const phone = normalizePhone(payload?.phone);
    if (!phone) {
      throw new BadRequestException('Telefon raqami yoki parol xato');
    }

    const existUser = await this.prisma.user.findFirst({
      where: { phone },
    });

    if (!existUser) {
      throw new BadRequestException('Telefon raqami yoki parol xato');
    }

    if (!(await comparePassword(payload.password, existUser.password))) {
      await this.logFailedLogin(
        phone,
        context,
        'user',
        existUser.organizationId,
      );
      throw new BadRequestException('Telefon raqami yoki parol xato');
    }

    await this.ensureAccountIsActive(
      existUser.status,
      phone,
      context,
      'user',
      existUser.organizationId,
    );

    // Log login activity
    await this.logLogin(
      existUser.phone,
      context,
      'user',
      true,
      existUser.organizationId,
    );

    const tokens = await this.issueTokens(existUser, 'user', context);

    return {
      success: true,
      ...tokens,
      access_token: tokens.accessToken,
      user: {
        id: existUser.id,
        phone: existUser.phone,
        fullName: existUser.fullName,
        role: existUser.role,
        position: existUser.position,
      },
    };
  }

  async loginTeacher(payload: LoginDto, context: RequestContext = {}) {
    const phone = normalizePhone(payload?.phone);
    if (!phone) {
      throw new BadRequestException('Login or password wrong');
    }

    const existTeacher = await this.prisma.teacher.findFirst({
      where: { phone },
    });

    if (!existTeacher) {
      throw new BadRequestException('Login or password wrong');
    }

    if (!(await comparePassword(payload.password, existTeacher.password))) {
      await this.logFailedLogin(
        phone,
        context,
        'teacher',
        existTeacher.organizationId,
      );
      throw new BadRequestException('Login or password wrong');
    }

    await this.ensureAccountIsActive(
      existTeacher.status,
      phone,
      context,
      'teacher',
      existTeacher.organizationId,
    );

    // Log login activity
    await this.logLogin(
      existTeacher.phone,
      context,
      'teacher',
      true,
      existTeacher.organizationId,
    );

    const tokens = await this.issueTokens(
      {
        id: existTeacher.id,
        phone: existTeacher.phone,
        role: Role.TEACHER,
        fullName: existTeacher.fullName,
      },
      'teacher',
      context,
    );

    return {
      success: true,
      ...tokens,
      user: {
        id: existTeacher.id,
        phone: existTeacher.phone,
        fullName: existTeacher.fullName,
        role: Role.TEACHER,
      },
    };
  }

  async loginStudent(payload: LoginDto, context: RequestContext = {}) {
    const phone = normalizePhone(payload?.phone);
    if (!phone) {
      throw new BadRequestException('Login or password wrong');
    }

    const existStudent = await this.prisma.student.findFirst({
      where: { phone },
    });

    if (!existStudent) {
      throw new BadRequestException('Login or password wrong');
    }
    if (!(await comparePassword(payload.password, existStudent.password))) {
      await this.logFailedLogin(
        phone,
        context,
        'student',
        existStudent.organizationId,
      );
      throw new BadRequestException('Login or password wrong');
    }

    await this.ensureAccountIsActive(
      existStudent.status,
      phone,
      context,
      'student',
      existStudent.organizationId,
    );

    // Log login activity
    await this.logLogin(
      existStudent.phone,
      context,
      'student',
      true,
      existStudent.organizationId,
    );

    const tokens = await this.issueTokens(
      {
        id: existStudent.id,
        phone: existStudent.phone,
        role: Role.STUDENT,
        fullName: existStudent.fullName,
      },
      'student',
      context,
    );

    return {
      success: true,
      ...tokens,
      user: {
        id: existStudent.id,
        phone: existStudent.phone,
        fullName: existStudent.fullName,
        role: Role.STUDENT,
      },
    };
  }

  /**
   * Access token muddati tugaganda mijoz shu yerga keladi: refresh token
   * almashtiriladi va yangi access token beriladi.
   *
   * Hisob holati va roli har safar bazadan qayta o'qiladi — bloklangan yoki
   * roli o'zgargan xodim yangi token ololmaydi.
   */
  async refresh(refreshToken: string, context: RequestContext = {}) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token yuborilmadi');
    }

    const rotated = await this.sessionService.rotate(refreshToken, context);
    const account = await this.loadAccountById(
      rotated.userId,
      rotated.userType,
    );

    if (!account) {
      await this.sessionService.revokeSession(rotated.sessionId);
      throw new UnauthorizedException('Hisob topilmadi');
    }

    if (account.status !== UserStatus.ACTIVE) {
      await this.sessionService.revokeSession(rotated.sessionId);
      throw new UnauthorizedException('Hisob faol emas');
    }

    const accessToken = this.generateToken({
      id: account.id,
      phone: account.phone,
      role: account.role,
      fullName: account.fullName,
      sid: rotated.sessionId,
    });

    return {
      success: true,
      accessToken,
      access_token: accessToken,
      refreshToken: rotated.refreshToken,
      refreshTokenExpiresAt: rotated.expiresAt.toISOString(),
      user: {
        id: account.id,
        phone: account.phone,
        fullName: account.fullName,
        role: account.role,
      },
    };
  }

  /**
   * Chiqish. Sessiya serverda yopiladi, ya'ni o'sha qurilmadagi access token
   * ham shu zahoti ishlamay qoladi.
   *
   * Access token allaqachon eskirgan bo'lsa `sid` bo'lmaydi — shuning uchun
   * refresh token bo'yicha ham yopish yo'li qoldirilgan.
   */
  async logout(sessionId?: string, refreshToken?: string) {
    if (sessionId) {
      await this.sessionService.revokeSession(sessionId);
    } else if (refreshToken) {
      await this.sessionService.revokeByRefreshToken(refreshToken);
    }

    return { success: true, message: 'Tizimdan chiqdingiz' };
  }

  /**
   * Access token ichidagi sessiya raqami.
   *
   * Imzo tekshiriladi (begona token bilan birovning sessiyasini yopib
   * bo'lmasin), lekin muddat tekshirilmaydi: chiqish tugmasi ko'pincha aynan
   * token eskirgandan keyin bosiladi va o'shanda ham sessiya yopilishi kerak.
   */
  sessionIdFromToken(token: string): string | undefined {
    try {
      const payload = this.jwtService.verify<TokenPayload>(token, {
        ignoreExpiration: true,
      });

      return payload?.sid;
    } catch {
      return undefined;
    }
  }

  /** Hamma qurilmadan chiqish - o'g'irlangan token bo'lsa shu ishlatiladi. */
  async logoutAll(currentUser: { id: number; role: Role }) {
    const count = await this.sessionService.revokeAllForAccount(
      currentUser.id,
      this.accountKindForRole(currentUser.role),
    );

    return {
      success: true,
      message: `${count} ta sessiya yopildi`,
      revokedSessions: count,
    };
  }

  /**
   * Hisobni ID va turi bo'yicha o'qiydi.
   *
   * Tur (`user`/`teacher`/`student`) shart: uchala jadvalning ID hisoblagichi
   * alohida, ya'ni 5-raqamli o'qituvchi ham, 5-raqamli o'quvchi ham bor.
   */
  private async loadAccountById(
    id: number,
    userType: AccountKind,
  ): Promise<{
    id: number;
    phone: string;
    fullName: string;
    role: Role;
    status: UserStatus;
  } | null> {
    if (userType === 'teacher') {
      const teacher = await this.prisma.teacher.findUnique({ where: { id } });
      return teacher ? { ...teacher, role: Role.TEACHER } : null;
    }

    if (userType === 'student') {
      const student = await this.prisma.student.findUnique({ where: { id } });
      return student ? { ...student, role: Role.STUDENT } : null;
    }

    return this.prisma.user.findUnique({ where: { id } });
  }

  /**
   * Telefon raqami bo'yicha hisobni uch jadvaldan qidiradi.
   * Raqam har uchalasida ham unique, shuning uchun natija bittadan oshmaydi.
   */
  private async findAccountByPhone(
    phone: string,
  ): Promise<{ kind: AccountKind; id: number } | null> {
    const [user, teacher, student] = await Promise.all([
      this.prisma.user.findUnique({ where: { phone }, select: { id: true } }),
      this.prisma.teacher.findUnique({
        where: { phone },
        select: { id: true },
      }),
      this.prisma.student.findUnique({
        where: { phone },
        select: { id: true },
      }),
    ]);

    if (user) return { kind: 'user', id: user.id };
    if (teacher) return { kind: 'teacher', id: teacher.id };
    if (student) return { kind: 'student', id: student.id };
    return null;
  }

  private async writePassword(
    account: { kind: AccountKind; id: number },
    password: string,
  ): Promise<void> {
    const data = { password: await hashPassword(password) };

    if (account.kind === 'user') {
      await this.prisma.user.update({ where: { id: account.id }, data });
    } else if (account.kind === 'teacher') {
      await this.prisma.teacher.update({ where: { id: account.id }, data });
    } else {
      await this.prisma.student.update({ where: { id: account.id }, data });
    }
  }

  private async writePhone(
    account: { kind: AccountKind; id: number },
    phone: string,
  ): Promise<void> {
    const data = { phone };

    if (account.kind === 'user') {
      await this.prisma.user.update({ where: { id: account.id }, data });
    } else if (account.kind === 'teacher') {
      await this.prisma.teacher.update({ where: { id: account.id }, data });
    } else {
      await this.prisma.student.update({ where: { id: account.id }, data });
    }
  }

  async sendVerificationCode(phone: string, purpose: VerificationPurpose) {
    const account = await this.findAccountByPhone(phone);

    if (purpose === VerificationPurpose.RESET_PASSWORD) {
      if (!account) {
        throw new NotFoundException(
          "Bu telefon raqami ro'yxatdan o'tmagan. Avval ro'yxatdan o'ting",
        );
      }

      return this.verificationService.sendCode(phone, purpose);
    }

    if (account) {
      throw new ConflictException(
        purpose === VerificationPurpose.CHANGE_PHONE
          ? 'Bu telefon raqami boshqa hisobga biriktirilgan'
          : "Bu telefon raqami allaqachon ro'yxatdan o'tgan. Tizimga kiring yoki parolni tiklang",
      );
    }

    return this.verificationService.sendCode(phone, purpose);
  }

  /**
   * SMS kod tasdiqlangandan keyin foydalanuvchi o'zi parol qo'yadi.
   * `purpose` REGISTER (birinchi kirish) yoki RESET_PASSWORD (parolni tiklash).
   */
  async setPassword(
    phone: string,
    code: string,
    password: string,
    purpose: VerificationPurpose,
  ) {
    const account = await this.findAccountByPhone(phone);
    if (!account) {
      throw new NotFoundException(
        'Bunday telefon raqami bilan hisob topilmadi',
      );
    }

    await this.verificationService.verifyAndConsume(phone, code, purpose);
    await this.writePassword(account, password);

    /*
      Parol almashgach eski sessiyalar yopiladi. Aks holda parolni o'g'irlab
      kirgan odam parol almashtirilgandan keyin ham o'z tokeni bilan
      ishlashda davom etardi - ya'ni parolni tiklash hech narsani to'xtatmasdi.
    */
    await this.sessionService.revokeAllForAccount(account.id, account.kind);

    return {
      success: true,
      message:
        purpose === VerificationPurpose.RESET_PASSWORD
          ? 'Parol yangilandi'
          : "Parol o'rnatildi",
    };
  }

  /** Parolni tiklash uchun kod so'rash. */
  async forgotPassword(phone: string) {
    return this.sendVerificationCode(phone, VerificationPurpose.RESET_PASSWORD);
  }

  /** Telefon raqamini o'zgartirish uchun YANGI raqamga kod yuboriladi. */
  async requestPhoneChange(newPhone: string) {
    return this.sendVerificationCode(
      newPhone,
      VerificationPurpose.CHANGE_PHONE,
    );
  }

  async confirmPhoneChange(
    currentUser: { id: number; role: Role },
    newPhone: string,
    code: string,
  ) {
    const existing = await this.findAccountByPhone(newPhone);
    if (existing) {
      throw new ConflictException(
        "Bu telefon raqami allaqachon ro'yxatdan o'tgan",
      );
    }

    await this.verificationService.verifyAndConsume(
      newPhone,
      code,
      VerificationPurpose.CHANGE_PHONE,
    );

    const kind = this.accountKindForRole(currentUser.role);

    await this.writePhone({ kind, id: currentUser.id }, newPhone);

    // Token ichidagi telefon raqami endi eskirgan, shuning uchun hamma
    // sessiya yopiladi - xabar ham "qaytadan kiring" deydi.
    await this.sessionService.revokeAllForAccount(currentUser.id, kind);

    return {
      success: true,
      message: "Telefon raqami o'zgartirildi. Qaytadan tizimga kiring",
      phone: newPhone,
    };
  }
}
