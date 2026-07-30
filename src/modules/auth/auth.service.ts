import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtService } from '@nestjs/jwt';
import { comparePassword, hashPassword } from 'src/common/bcrypt/bcrypt';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { Role, UserStatus, VerificationPurpose } from '@prisma/client';
import { normalizePhone } from 'src/common/utils/phone.util';
import { VerificationService } from './verification.service';

/** Bitta telefon raqami uchta jadvaldan birida bo'lishi mumkin. */
type AccountKind = 'user' | 'teacher' | 'student';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private verificationService: VerificationService,
  ) {}

  private async generateToken(payload: {
    id: number;
    phone: string;
    role: Role;
    fullName: string;
  }) {
    return await this.jwtService.sign(payload);
  }

  /**
   * Bloklangan yoki muzlatilgan hisob tizimga kira olmasligi kerak. Parol
   * to'g'ri bo'lsa ham to'xtatamiz, aks holda "o'chirilgan" xodim eski paroli
   * bilan ishlashda davom etaveradi.
   */
  private ensureAccountIsActive(status: UserStatus) {
    if (status === UserStatus.ACTIVE) return;

    throw new BadRequestException(
      status === UserStatus.FREEZE
        ? 'Hisobingiz vaqtincha muzlatilgan. Administratorga murojaat qiling'
        : 'Hisobingiz faol emas. Administratorga murojaat qiling',
    );
  }

  private async logLogin(
    phone: string,
    ipAddress: string,
    loginType: string = 'user',
  ): Promise<void> {
    try {
      await this.prisma.loginLog.create({
        data: {
          userPhone: phone,
          ipAddress,
          loginType,
          success: true,
        },
      });
    } catch (error) {
      console.error('Login logging xatosi:', error);
    }
  }

  /**
   * Ochiq ro'yxatdan o'tish - yangi hisob doim STUDENT bo'lib ochiladi va
   * foydalanuvchi darhol tizimga kiritiladi.
   */
  async register(payload: RegisterDto, ipAddress: string = '') {
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

    await this.logLogin(student.phone, ipAddress, 'student');

    const accessToken = await this.generateToken({
      id: student.id,
      phone: student.phone,
      role: Role.STUDENT,
      fullName: student.fullName,
    });

    return {
      success: true,
      message: "Ro'yxatdan o'tdingiz",
      accessToken,
      access_token: accessToken,
      user: {
        id: student.id,
        phone: student.phone,
        fullName: student.fullName,
        role: Role.STUDENT,
      },
    };
  }

  async login(payload: LoginDto, ipAddress: string = '') {
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
      throw new BadRequestException('Telefon raqami yoki parol xato');
    }

    this.ensureAccountIsActive(existUser.status);

    // Log login activity
    await this.logLogin(existUser.phone, ipAddress, 'user');

    const accessToken = await this.generateToken({
      id: existUser.id,
      phone: existUser.phone,
      role: existUser.role,
      fullName: existUser.fullName,
    });
    return {
      success: true,
      accessToken: accessToken,
      access_token: accessToken,
      user: {
        id: existUser.id,
        phone: existUser.phone,
        fullName: existUser.fullName,
        role: existUser.role,
        position: existUser.position,
      },
    };
  }

  async loginTeacher(payload: LoginDto, ipAddress: string = '') {
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
      throw new BadRequestException('Login or password wrong');
    }

    this.ensureAccountIsActive(existTeacher.status);

    // Log login activity
    await this.logLogin(existTeacher.phone, ipAddress, 'teacher');

    const accessToken = await this.generateToken({
      id: existTeacher.id,
      phone: existTeacher.phone,
      role: Role.TEACHER,
      fullName: existTeacher.fullName,
    });

    return {
      success: true,
      accessToken,
    };
  }

  async loginStudent(payload: LoginDto, ipAddress: string = '') {
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
      throw new BadRequestException('Login or password wrong');
    }

    this.ensureAccountIsActive(existStudent.status);

    // Log login activity
    await this.logLogin(existStudent.phone, ipAddress, 'student');

    const accessToken = await this.generateToken({
      id: existStudent.id,
      phone: existStudent.phone,
      role: Role.STUDENT,
      fullName: existStudent.fullName,
    });

    return {
      success: true,
      accessToken,
    };
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
      this.prisma.teacher.findUnique({ where: { phone }, select: { id: true } }),
      this.prisma.student.findUnique({ where: { phone }, select: { id: true } }),
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
          ? "Bu telefon raqami boshqa hisobga biriktirilgan"
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
      throw new NotFoundException('Bunday telefon raqami bilan hisob topilmadi');
    }

    await this.verificationService.verifyAndConsume(phone, code, purpose);
    await this.writePassword(account, password);

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

    const kind: AccountKind =
      currentUser.role === Role.STUDENT
        ? 'student'
        : currentUser.role === Role.TEACHER
          ? 'teacher'
          : 'user';

    await this.writePhone({ kind, id: currentUser.id }, newPhone);

    return {
      success: true,
      message: "Telefon raqami o'zgartirildi. Qaytadan tizimga kiring",
      phone: newPhone,
    };
  }
}
