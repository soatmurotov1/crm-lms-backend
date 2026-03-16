import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MailerService } from 'src/common/email/mailer.service';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { CloudinaryService } from 'src/common/cloudinary/cloudinary.service';
import { CreateStudentDto } from './dto/create.students.dto';
import { hashPassword } from 'src/common/bcrypt/bcrypt';
import { UpdateStudentDto } from './dto/update.students.dto';

@Injectable()
export class StudentsService {
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

  async createStudent(payload: CreateStudentDto, file?: Express.Multer.File) {
    let photoUrl: string | null = null;

    if (file) {
      photoUrl = await this.cloudinaryService.uploadFile(file, 'students');
    }

    await this.prisma.student.create({
      data: {
        ...payload,
        password: await hashPassword(payload.password),
        photo: photoUrl,
        birth_date: new Date(payload.birth_date),
      },
    });

    await this.mailerService.sendEmail(
      payload.email,
      payload.email,
      payload.password,
    );

    return {
      success: true,
      message: 'Student successfully created',
    };
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
    }
  }

  async getMyProfile(id: number) {
      const student = await this.prisma.student.findUnique({
        where: { id }
      })
      if (!student) {
        throw new NotFoundException('Student not found')
      }
      return {
        success: true,
        data: student
      }
  }

  async deleteStudentById(studentId: number, currentUser: { id: number }) {
  const student = await this.prisma.student.findUnique({
    where: { id: studentId }
  })
  if (!student) {
    throw new NotFoundException('Student not found');
  }
  if (student.id === currentUser.id) {
    throw new ForbiddenException("You can't delete your own account")
  }
  await this.prisma.student.delete({
    where: { id: studentId }
  })
  return {  
    success: true,
    message: 'Student successfully deleted'
  };
}
}
