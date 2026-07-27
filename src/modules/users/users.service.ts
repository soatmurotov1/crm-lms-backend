import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UpdateUserDto } from './dto/update.user.dto';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { CloudinaryService } from 'src/common/cloudinary/cloudinary.service';
import { CreateUserDto } from './dto/create.users.dto';
import { hashPassword } from 'src/common/bcrypt/bcrypt';
import { normalizePhone } from 'src/common/utils/phone.util';
import { VerificationService } from 'src/modules/auth/verification.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private cloudinaryService: CloudinaryService,
    private verificationService: VerificationService,
  ) {}

  async createUser(payload: CreateUserDto, file?: Express.Multer.File) {
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

  async getAllUsers() {
    const users = await this.prisma.user.findMany({
      omit: { password: true },
    });

    return {
      success: true,
      data: users,
    };
  }

  async getOneUser(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
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
    file?: Express.Multer.File,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User is Not found');
    }

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

  async deleteUser(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User is Not found');
    }
    await this.prisma.user.delete({ where: { id } });

    return {
      success: true,
      message: 'User deleted successfully',
    };
  }
}
