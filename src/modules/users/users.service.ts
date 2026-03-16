import { Injectable, NotFoundException } from '@nestjs/common';
import { UpdateUserDto } from './dto/update.user.dto';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { MailerService } from 'src/common/email/mailer.service';
import { CloudinaryService } from 'src/common/cloudinary/cloudinary.service';
import { CreateUserDto } from './dto/create.users.dto';
import { hashPassword } from 'src/common/bcrypt/bcrypt';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private mailerService: MailerService,
    private cloudinaryService: CloudinaryService,
  ) {}

  async createUser(payload: CreateUserDto, file?: Express.Multer.File) {
    let photoUrl: string | null = null;

    if (file) {
      photoUrl = await this.cloudinaryService.uploadFile(file, 'users');
    }

    await this.prisma.user.create({
      data: {
        ...payload,
        password: await hashPassword(payload.password),
        hire_date: new Date(payload.hire_date),
        photo: photoUrl,
      },
    });

    await this.mailerService.sendEmail(
      payload.email,
      payload.email,
      payload.password,
    );

    return {
      success: true,
      message: 'User successfully created',
    };
  }

  async getAllUsers() {
    const users = await this.prisma.user.findMany();

    return {
      success: true,
      data: users,
    };
  }

  async getOneUser(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
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
