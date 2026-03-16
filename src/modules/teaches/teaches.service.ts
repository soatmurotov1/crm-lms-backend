import { Injectable, NotFoundException } from '@nestjs/common';
import { MailerService } from 'src/common/email/mailer.service';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { CloudinaryService } from 'src/common/cloudinary/cloudinary.service';
import { CreateTeacherDto } from './dto/create.teachers.dto';
import { hashPassword } from 'src/common/bcrypt/bcrypt';
import { UpdateTeachersDto } from './dto/update.teachers.dto';

@Injectable()
export class TeachersService {
  constructor(
    private prisma: PrismaService,
    private mailerService: MailerService,
    private cloudinaryService: CloudinaryService,
  ) {}

  async createTeacher(payload: CreateTeacherDto, file?: Express.Multer.File) {
    let photoUrl: string | null = null;

    if (file) {
      photoUrl = await this.cloudinaryService.uploadFile(file, 'teachers');
    }

    await this.prisma.teacher.create({
      data: {
        ...payload,
        experience: Number(payload.experience),
        password: await hashPassword(payload.password),
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

  async updateTeacherById(id: number, payload: UpdateTeachersDto, file?: Express.Multer.File) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { id }
    })
    if (!teacher) {
      throw new NotFoundException(`Not found teacherId ${id}`)
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
    })
    return {
      success: true,
      message: 'Teacher updated successfully',
    }
  }

  async deleteTeacher(id: number) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { id }
    })
    if (!teacher) {
      throw new NotFoundException(`Not found teacherId ${id}`)
    }
    await this.prisma.teacher.delete({
      where: { id },
    })
    return {
      message: 'Teacher deleted successfully',
      id: id,
    };
  }
}
