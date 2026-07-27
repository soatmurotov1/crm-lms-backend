import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { UpdateUserDto } from './dto/update.user.dto';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { MailerService } from 'src/common/email/mailer.service';
import { CloudinaryService } from 'src/common/cloudinary/cloudinary.service';
import { CreateUserDto } from './dto/create.users.dto';
import { hashPassword } from 'src/common/bcrypt/bcrypt';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private mailerService: MailerService,
    private cloudinaryService: CloudinaryService,
  ) {}

  async createUser(payload: CreateUserDto, file?: Express.Multer.File) {
    let photoUrl: string | null = null;
    const normalizedEmail = payload.email.trim().toLowerCase();
    const plainPassword = payload.password.trim();

    if (file) {
      photoUrl = await this.cloudinaryService.uploadFile(file, 'users');
    }

    await this.prisma.user.create({
      data: {
        ...payload,
        email: normalizedEmail,
        password: await hashPassword(plainPassword),
        hire_date: new Date(payload.hire_date),
        photo: photoUrl,
      },
    });

    // Email ketmasa ham foydalanuvchi yaratilgan bo'ladi, shuning uchun
    // xatolik butun so'rovni yiqitmasligi kerak.
    try {
      await this.mailerService.sendEmail(
        normalizedEmail,
        normalizedEmail,
        plainPassword,
      );
    } catch (error) {
      this.logger.error(
        `User created but email send failed: ${normalizedEmail}`,
        error instanceof Error ? error.stack : undefined,
      );
      return {
        success: true,
        emailSent: false,
        message: 'Foydalanuvchi yaratildi, lekin email yuborilmadi',
      };
    }

    return {
      success: true,
      emailSent: true,
      message: 'User successfully created',
    };
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

    if (file) {
      photoUrl = await this.cloudinaryService.uploadFile(file, 'users');
    }

    await this.prisma.user.update({
      where: { id },
      data: {
        ...payload,
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
