import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { UpdateUserDto } from './dto/update.user.dto';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { CloudinaryService } from 'src/common/cloudinary/cloudinary.service';
import { CreateUserDto } from './dto/create.users.dto';
import { hashPassword } from 'src/common/bcrypt/bcrypt';
import { normalizePhone } from 'src/common/utils/phone.util';
import { VerificationService } from 'src/modules/auth/verification.service';
import { PaginationQueryDto } from 'src/common/dto/pagination.dto';
import {
  buildPaginatedResult,
  resolvePagination,
} from 'src/common/utils/pagination.util';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import {
  orgFilter,
  resolveOwnerOrganizationId,
} from 'src/common/utils/org-scope.util';

/** JWT'dan keladigan so'rov egasi. */
type CurrentUser = RequestUser;

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private cloudinaryService: CloudinaryService,
    private verificationService: VerificationService,
  ) {}

  async createUser(
    payload: CreateUserDto,
    currentUser: CurrentUser,
    file?: Express.Multer.File,
  ) {
    // ADMIN o'zidan yuqori huquqli hisob ocha olmasligi kerak.
    if (payload.role === Role.SUPERADMIN && currentUser.role !== Role.SUPERADMIN) {
      throw new ForbiddenException('SUPERADMIN hisobini yarata olmaysiz');
    }

    // Yangi xodim so'rov egasining tashkilotiga biriktiriladi.
    const organizationId = resolveOwnerOrganizationId(currentUser);

    let photoUrl: string | null = null;
    const normalizedPhone = normalizePhone(payload.phone);
    const plainPassword = payload.password.trim();

    await this.ensurePhoneIsFree(normalizedPhone);

    if (file) {
      photoUrl = await this.cloudinaryService.uploadFile(file, 'users');
    }

    await this.prisma.user.create({
      data: {
        ...payload,
        phone: normalizedPhone,
        password: await hashPassword(plainPassword),
        hire_date: new Date(payload.hire_date),
        photo: photoUrl,
        organizationId,
      },
    });

    // SMS ketmasa ham foydalanuvchi yaratilgan bo'ladi, shuning uchun
    // xatolik butun so'rovni yiqitmasligi kerak.
    const smsSent = await this.verificationService.sendCodeQuietly(
      normalizedPhone,
    );

    return {
      success: true,
      smsSent,
      message: smsSent
        ? 'User successfully created'
        : 'Foydalanuvchi yaratildi, lekin SMS yuborilmadi',
    };
  }

  /**
   * Huquq oshirishning oldini oladi. Uch qoida:
   *  1) rolni faqat SUPERADMIN o'zgartira oladi;
   *  2) hech kim o'z rolini o'zgartira olmaydi;
   *  3) SUPERADMIN hisobiga faqat SUPERADMIN tega oladi — aks holda ADMIN
   *     uning telefonini almashtirib, parol tiklash orqali hisobni egallaydi.
   */
  private ensureCanManage(
    target: { id: number; role: Role },
    payload: UpdateUserDto,
    currentUser: CurrentUser,
  ) {
    if (
      target.role === Role.SUPERADMIN &&
      currentUser.role !== Role.SUPERADMIN
    ) {
      throw new ForbiddenException('Bu hisobni tahrirlash mumkin emas');
    }

    if (!payload.role || payload.role === target.role) return;

    if (currentUser.role !== Role.SUPERADMIN) {
      throw new ForbiddenException("Rolni faqat SUPERADMIN o'zgartira oladi");
    }

    if (currentUser.id === target.id) {
      throw new ForbiddenException("O'z rolingizni o'zgartira olmaysiz");
    }
  }

  private async ensurePhoneIsFree(phone: string, excludeId?: number) {
    const existing = await this.prisma.user.findFirst({
      where: {
        phone,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(
        "Bu telefon raqami allaqachon ro'yxatdan o'tgan. Boshqa raqam kiriting",
      );
    }
  }

  async getAllUsers(currentUser: CurrentUser, query?: PaginationQueryDto) {
    const { take, skip } = resolvePagination(query);
    // Har bir tashkilot faqat o'z xodimlarini ko'radi.
    const where = orgFilter(currentUser);

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        omit: { password: true },
        orderBy: { id: 'desc' },
        take,
        skip,
      }),
      this.prisma.user.count({ where }),
    ]);

    return buildPaginatedResult(users, total, query, 'users');
  }

  async getOneUser(currentUser: CurrentUser, id: number) {
    const user = await this.prisma.user.findFirst({
      where: { id, ...orgFilter(currentUser) },
      omit: { password: true },
    });
    if (!user) {
      throw new NotFoundException('User is Not found');
    }

    return {
      success: true,
      data: user,
    };
  }

  async updateUser(
    id: number,
    payload: UpdateUserDto,
    currentUser: CurrentUser,
    file?: Express.Multer.File,
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id, ...orgFilter(currentUser) },
    });
    if (!user) {
      throw new NotFoundException('User is Not found');
    }

    this.ensureCanManage(user, payload, currentUser);

    let photoUrl: string | null = user.photo;
    let normalizedPhone: string | undefined;

    if (payload.phone && payload.phone.trim() !== '') {
      normalizedPhone = normalizePhone(payload.phone);
      if (normalizedPhone !== user.phone) {
        await this.ensurePhoneIsFree(normalizedPhone, id);
      }
    }

    if (file) {
      photoUrl = await this.cloudinaryService.uploadFile(file, 'users');
    }

    await this.prisma.user.update({
      where: { id },
      data: {
        ...payload,
        phone: normalizedPhone,
        photo: photoUrl,
      },
    });

    return {
      success: true,
      message: 'User updated successfully',
    };
  }

  async deleteUser(id: number, currentUser: CurrentUser) {
    const user = await this.prisma.user.findFirst({
      where: { id, ...orgFilter(currentUser) },
    });
    if (!user) {
      throw new NotFoundException('User is Not found');
    }

    if (currentUser.id === id) {
      throw new ForbiddenException("O'z hisobingizni o'chira olmaysiz");
    }

    if (user.role === Role.SUPERADMIN && currentUser.role !== Role.SUPERADMIN) {
      throw new ForbiddenException("Bu hisobni o'chirish mumkin emas");
    }

    await this.prisma.user.delete({ where: { id } });

    return {
      success: true,
      message: 'User deleted successfully',
    };
  }
}
