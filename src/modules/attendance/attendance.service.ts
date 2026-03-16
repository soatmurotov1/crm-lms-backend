import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService) {}

  async getAttendanceByLesson(lessonId: number) {
    const existLesson = await this.prisma.lesson.findUnique({
      where: {
        id: lessonId,
      },
    });
    if (!existLesson) {
      throw new NotFoundException('Lesson not found with this id');
    }

    const lessonStudents = await this.prisma.attendance.findMany({
      where: {
        lessonId: lessonId,
      },
      select: {
        isPresent: true,
        student: {
          select: {
            id: true,
            fullName: true,
            photo: true,
          },
        },
      },
    });
    return {
      success: true,
      data: lessonStudents,
    };
  }

  async createAttendance(
    payload: CreateAttendanceDto,
    currentUser: { id: number; role: Role },
  ) {
    const existLesson = await this.prisma.lesson.findUnique({
      where: {
        id: payload.lessonId,
      },
      select: {
        id: true,
        group: {
          select: {
            teacherId: true,
          },
        },
      },
    });

    if (!existLesson) {
      throw new NotFoundException('Lesson not found with this id');
    }

    if (
      currentUser.role == Role.TEACHER &&
      existLesson.group.teacherId != currentUser.id
    ) {
      throw new NotFoundException('Bu sening darsing emas');
    }

    const existStudent = await this.prisma.student.findUnique({
      where: {
        id: payload.studentId,
        status: 'ACTIVE',
      },
    });
    if (!existStudent) {
      throw new NotFoundException('Student not found with this id');
    }

    await this.prisma.attendance.create({
      data: {
        ...payload,
        teacherId: currentUser.role == Role.TEACHER ? currentUser.id : null,
        userId: currentUser.role != Role.TEACHER ? currentUser.id : null,
      },
    });

    return {
      success: true,
      message: 'Attendance created successfully',
    };
  }

  async updateAttendance(
    payload: CreateAttendanceDto,
    currentUser: { id: number; role: Role },
  ) {
    const existAttendance = await this.prisma.attendance.findFirst({
      where: {
        lessonId: payload.lessonId,
        studentId: payload.studentId,
      },
    });
    if (!existAttendance) {
      throw new NotFoundException(
        'Attendance not found with this lesson id and student id',
      );
    }
    const existLesson = await this.prisma.lesson.findUnique({
      where: {
        id: payload.lessonId,
      },
      select: {
        id: true,
        group: {
          select: {
            teacherId: true,
          },
        },
      },
    });
    if (!existLesson) {
      throw new NotFoundException('Lesson not found with this id');
    }

    if (
      currentUser.role == Role.TEACHER &&
      existLesson.group.teacherId != currentUser.id
    ) {
      throw new NotFoundException('Bu sening darsing emas');
    }
    await this.prisma.attendance.update({
      where: {
        id: existAttendance.id,
      },
      data: {
        isPresent: payload.isPresent,
        teacherId: currentUser.role == Role.TEACHER ? currentUser.id : null,
        userId: currentUser.role != Role.TEACHER ? currentUser.id : null,
      },
    });
  }
}
