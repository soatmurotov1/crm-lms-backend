import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MailerService } from 'src/common/email/mailer.service';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { CloudinaryService } from 'src/common/cloudinary/cloudinary.service';
import { CreateTeacherDto } from './dto/create.teachers.dto';
import { comparePassword, hashPassword } from 'src/common/bcrypt/bcrypt';
import { UpdateTeachersDto } from './dto/update.teachers.dto';
import { UserStatus } from '@prisma/client';
import { ChangeTeacherPasswordDto } from './dto/change-teacher-password.dto';

@Injectable()
export class TeachersService {
  constructor(
    private prisma: PrismaService,
    private mailerService: MailerService,
    private cloudinaryService: CloudinaryService,
  ) {}

  async createTeacher(
    payload: CreateTeacherDto,
    creatorEmail: string,
    file?: Express.Multer.File,
  ) {
    let photoUrl: string | null = null;

    if (file) {
      photoUrl = await this.cloudinaryService.uploadFile(file, 'teachers');
    }

    const teacher = await this.prisma.teacher.create({
      data: {
        ...payload,
        experience: Number(payload.experience),
        password: await hashPassword(payload.password),
        photo: photoUrl,
      },
    });

    await this.mailerService.sendEmail(
      creatorEmail,
      payload.email,
      payload.password,
    );

    return {
      success: true,
      message: 'Teacher successfully created',
    };
  }

  async getAllTeachers() {
    const Teachers = await this.prisma.teacher.findMany();

    return {
      success: true,
      data: Teachers,
    };
  }

  async getOneTeacher(id: number) {
    const Teacher = await this.prisma.teacher.findUnique({ where: { id } });
    if (!Teacher) {
      throw new NotFoundException('Teacher is Not found');
    }

    return {
      success: true,
      data: Teacher,
    };
  }

  async getMyProfile(currentUser: { id: number }) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { id: currentUser.id },
      select: {
        id: true,
        fullName: true,
        email: true,
        photo: true,
        position: true,
        experience: true,
        status: true,
        created_at: true,
      },
    });

    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }

    return {
      success: true,
      data: teacher,
    };
  }

  async updateTeacherById(
    id: number,
    payload: UpdateTeachersDto,
    file?: Express.Multer.File,
  ) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { id },
    });
    if (!teacher) {
      throw new NotFoundException(`Not found teacherId ${id}`);
    }
    let photoUrl: string | null = teacher.photo;

    if (file) {
      photoUrl = await this.cloudinaryService.uploadFile(file, 'teachers');
    }
    await this.prisma.teacher.update({
      where: { id },
      data: {
        ...payload,
        experience: payload.experience ? Number(payload.experience) : undefined,
        photo: photoUrl,
      },
    });
    return {
      success: true,
      message: 'Teacher updated successfully',
    };
  }

  async deleteTeacher(id: number) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { id },
    });
    if (!teacher) {
      throw new NotFoundException(`Not found teacherId ${id}`);
    }
    await this.prisma.teacher.delete({
      where: { id },
    });
    return {
      message: 'Teacher deleted successfully',
      id: id,
    };
  }

  async toggleArchiveTeacher(id: number) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!teacher) {
      throw new NotFoundException(`Not found teacherId ${id}`);
    }

    const nextStatus =
      teacher.status === UserStatus.ACTIVE
        ? UserStatus.INACTIVE
        : UserStatus.ACTIVE;

    const updatedTeacher = await this.prisma.teacher.update({
      where: { id },
      data: { status: nextStatus },
    });

    return {
      success: true,
      message:
        nextStatus === UserStatus.INACTIVE
          ? 'Teacher archived successfully'
          : 'Teacher unarchived successfully',
      data: updatedTeacher,
    };
  }

  async changeMyPassword(
    currentUser: { id: number },
    payload: ChangeTeacherPasswordDto,
  ) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { id: currentUser.id },
    });

    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }

    const oldPasswordValid = await comparePassword(
      payload.oldPassword,
      teacher.password,
    );

    if (!oldPasswordValid) {
      throw new BadRequestException("Amaldagi parol noto'g'ri");
    }

    if (payload.oldPassword === payload.newPassword) {
      throw new BadRequestException(
        "Amaldagi va yangi parol bir xil bo'lmasligi kerak",
      );
    }

    await this.prisma.teacher.update({
      where: { id: teacher.id },
      data: {
        password: await hashPassword(payload.newPassword),
      },
    });

    return {
      success: true,
      message: 'Parol muvaffaqiyatli yangilandi',
    };
  }
}
