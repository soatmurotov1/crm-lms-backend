import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MailerService } from 'src/common/email/mailer.service';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { CloudinaryService } from 'src/common/cloudinary/cloudinary.service';
import { CreateStudentDto } from './dto/create.students.dto';
import { comparePassword, hashPassword } from 'src/common/bcrypt/bcrypt';
import { UpdateStudentDto } from './dto/update.students.dto';
import { ChangeStudentPasswordDto } from './dto/change-student-password.dto';
import { getImageDimensions } from './utils/image-dimension.util';

@Injectable()
export class StudentsService {
  private readonly logger = new Logger(StudentsService.name);
  private readonly maxPhotoSize = 2 * 1024 * 1024;
  private readonly allowedPhotoMimeTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
  ];

  constructor(
    private prisma: PrismaService,
    private mailerService: MailerService,
    private cloudinaryService: CloudinaryService,
  ) {}

  async getMyGroups(currentUser: { id: number }) {
    const groups = await this.prisma.studentGroup.findMany({
      where: {
        studentId: currentUser.id,
        status: 'ACTIVE',
      },
      select: {
        group: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
    const formattedGroups = groups.map((group) => group.group);
    return {
      success: true,
      data: formattedGroups,
    };
  }

  async getMyGroupLessonVideo(groupId: number, currentUser: { id: number }) {
    const exitGroup = await this.prisma.studentGroup.findFirst({
      where: {
        groupId: groupId,
        studentId: currentUser.id,
        status: 'ACTIVE',
      },
    });

    if (!exitGroup) {
      throw new NotFoundException('Group not found');
    }

    const lessonVideo = await this.prisma.lessonVideo.findMany({
      where: {
        lesson: {
          groupId: groupId,
        },
      },
      select: {
        id: true,
        file: true,
        created_at: true,
        lesson: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });
    return {
      success: true,
      data: lessonVideo,
    };
  }

  async getMyGroupHomework(
    groupId: number,
    lessonId: number,
    currentUser: { id: number },
  ) {
    const group = await this.prisma.homework.findFirst({
      where: {
        lesson: {
          groupId: groupId,
        },
        lessonId: lessonId,
      },
      select: {
        id: true,
        title: true,
        file: true,
        durationTime: true,
        created_at: true,
      },
    });
    if (!group) {
      throw new NotFoundException('Homework is Not found');
    }
    return {
      success: true,
      data: group,
    };
  }

  async getMyLessons(groupId: number, currentUser: { id: number }) {
    const existsGroup = await this.prisma.studentGroup.findFirst({
      where: {
        studentId: currentUser.id,
        groupId: groupId,
        status: 'ACTIVE',
      },
    });
    if (!existsGroup) {
      throw new NotFoundException('Group not found');
    }

    const lessons = await this.prisma.lesson.findMany({
      where: {
        groupId,
      },
      select: {
        id: true,
        title: true,
      },
    });
    return {
      success: true,
      data: lessons,
    };
  }

  async createStudent(
    payload: CreateStudentDto,
    creatorEmail: string,
    file?: Express.Multer.File,
  ) {
    let photoUrl: string | null = null;
    const normalizedEmail = payload.email.trim().toLowerCase();
    const plainPassword = payload.password.trim();

    if (file) {
      this.validateStudentPhoto(file);
      photoUrl = await this.cloudinaryService.uploadFile(file, 'students');
    }

    const student = await this.prisma.student.create({
      data: {
        ...payload,
        email: normalizedEmail,
        password: await hashPassword(plainPassword),
        photo: photoUrl,
        birth_date: new Date(payload.birth_date),
      },
    });

    try {
      await this.mailerService.sendEmail(
        creatorEmail,
        normalizedEmail,
        plainPassword,
      );
    } catch (error) {
      this.logger.error(
        `Student created but email send failed: ${normalizedEmail}`,
        error instanceof Error ? error.stack : undefined,
      );
      return {
        success: true,
        emailSent: false,
        message: 'Student yaratildi, lekin email yuborilmadi',
      };
    }

    return {
      success: true,
      emailSent: true,
      message: 'Student successfully created',
    };
  }

  private validateStudentPhoto(file: Express.Multer.File) {
    if (!this.allowedPhotoMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        "Rasm formati noto'g'ri. Faqat JPEG, JPG yoki PNG ruxsat etiladi",
      );
    }

    if (file.size > this.maxPhotoSize) {
      throw new BadRequestException('Rasm hajmi 2MB dan oshmasligi kerak');
    }

    const dimensions = getImageDimensions(file.buffer);
    if (!dimensions) {
      throw new BadRequestException("Rasm o'qilmadi yoki yaroqsiz fayl");
    }

    if (dimensions.width !== 500 || dimensions.height !== 500) {
      throw new BadRequestException(
        "Rasm o'lchami aniq 500x500 bo'lishi kerak",
      );
    }
  }

  async getAllStudents() {
    const Students = await this.prisma.student.findMany();

    return {
      success: true,
      data: Students,
    };
  }

  async getOneStudent(id: number) {
    const Student = await this.prisma.student.findUnique({ where: { id } });
    if (!Student) {
      throw new NotFoundException('Student is Not found');
    }

    return {
      success: true,
      data: Student,
    };
  }

  async updateStudent(id: number, payload: UpdateStudentDto) {
    const Student = await this.prisma.student.findUnique({ where: { id } });
    if (!Student) {
      throw new NotFoundException('Student is Not found');
    }
    await this.prisma.student.update({ where: { id }, data: payload });

    return {
      success: true,
      message: 'Student updated successfully',
    };
  }

  async deleteStudent(id: number) {
    const Student = await this.prisma.student.findUnique({ where: { id } });
    if (!Student) {
      throw new NotFoundException('Student is Not found');
    }
    await this.prisma.student.delete({ where: { id } });
  }

  async updateStudentById(
    id: number,
    payload: UpdateStudentDto,
    file?: Express.Multer.File,
  ) {
    const Student = await this.prisma.student.findUnique({
      where: { id },
    });
    if (!Student) {
      throw new NotFoundException('Student is Not found');
    }

    const data: Prisma.StudentUpdateInput = {};

    if (payload.fullName && payload.fullName.trim() !== '') {
      data.fullName = payload.fullName.trim();
    }

    if (payload.email && payload.email.trim() !== '') {
      data.email = payload.email.trim();
    }

    if (payload.password && payload.password.trim() !== '') {
      data.password = await hashPassword(payload.password);
    }

    if (payload.birth_date && payload.birth_date.trim() !== '') {
      data.birth_date = new Date(payload.birth_date);
    }

    if (payload.status !== undefined) {
      data.status = payload.status;
    }

    if (file) {
      data.photo = await this.cloudinaryService.uploadFile(file, 'students');
    }

    if (Object.keys(data).length === 0) {
      return {
        success: true,
        message: 'No changes provided',
      };
    }

    await this.prisma.student.update({ where: { id }, data });
    return {
      success: true,
      message: 'Student updated successfully',
    };
  }

  async getMyProfile(currentUser: { id: number }) {
    const student = await this.prisma.student.findUnique({
      where: { id: currentUser.id },
      select: {
        id: true,
        fullName: true,
        email: true,
        birth_date: true,
        status: true,
      },
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }
    return {
      success: true,
      data: student,
    };
  }

  async deleteStudentById(studentId: number, currentUser: { id: number }) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }
    if (student.id === currentUser.id) {
      throw new ForbiddenException("You can't delete your own account");
    }
    await this.prisma.student.delete({
      where: { id: studentId },
    });
    return {
      success: true,
      message: 'Student successfully deleted',
    };
  }

  async changeMyPassword(
    currentUser: { id: number },
    payload: ChangeStudentPasswordDto,
  ) {
    const student = await this.prisma.student.findUnique({
      where: { id: currentUser.id },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const oldPasswordValid = await comparePassword(
      payload.oldPassword,
      student.password,
    );

    if (!oldPasswordValid) {
      throw new BadRequestException("Amaldagi parol noto'g'ri");
    }

    if (payload.oldPassword === payload.newPassword) {
      throw new BadRequestException(
        "Amaldagi va yangi parol bir xil bo'lmasligi kerak",
      );
    }

    await this.prisma.student.update({
      where: { id: student.id },
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
