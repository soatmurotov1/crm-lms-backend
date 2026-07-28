import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { AttendanceStatus, Role } from '@prisma/client';

@Injectable()
export class AttendanceService {
  /**
   * Eski mijozlar faqat `isPresent` yuboradi, yangilari `status`.
   * Ikkalasini bir-biriga moslab qaytaramiz.
   */
  private resolveAttendanceState(payload: {
    isPresent?: boolean;
    status?: AttendanceStatus;
  }) {
    if (payload.status) {
      return {
        status: payload.status,
        isPresent: payload.status !== AttendanceStatus.ABSENT,
      };
    }

    const isPresent = Boolean(payload.isPresent);
    return {
      status: isPresent ? AttendanceStatus.PRESENT : AttendanceStatus.ABSENT,
      isPresent,
    };
  }

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
        status: true,
        comment: true,
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

  /**
   * Oxirgi 7 kunlik davomat, hafta kunlari bo'yicha — dashboard'dagi
   * "Davomat statistikasi" grafigi uchun.
   *
   * Lesson modelida dars sanasi maydoni yo'q, shuning uchun guruhlash
   * Attendance.created_at (davomat belgilangan vaqt) bo'yicha amalga oshiriladi.
   */
  async getWeeklyStats(groupId?: number) {
    const since = new Date();
    since.setDate(since.getDate() - 6);
    since.setHours(0, 0, 0, 0);

    const records = await this.prisma.attendance.findMany({
      where: {
        created_at: { gte: since },
        ...(groupId ? { lesson: { groupId } } : {}),
      },
      select: {
        isPresent: true,
        created_at: true,
      },
    });

    // 0 = Yakshanba ... 6 = Shanba (JS getDay tartibi)
    const labels = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Juma', 'Shan'];
    const days = labels.map((label, index) => ({
      day: label,
      weekday: index,
      present: 0,
      total: 0,
      percent: 0,
    }));

    records.forEach((record) => {
      const bucket = days[record.created_at.getDay()];
      bucket.total += 1;
      if (record.isPresent) bucket.present += 1;
    });

    days.forEach((bucket) => {
      bucket.percent = bucket.total
        ? Math.round((bucket.present / bucket.total) * 100)
        : 0;
    });

    // Dushanbadan boshlab qaytaramiz
    const ordered = [...days.slice(1), days[0]];

    return {
      success: true,
      data: ordered,
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

    const state = this.resolveAttendanceState(payload);

    await this.prisma.attendance.create({
      data: {
        lessonId: payload.lessonId,
        studentId: payload.studentId,
        comment: payload.comment,
        ...state,
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
    const state = this.resolveAttendanceState(payload);

    await this.prisma.attendance.update({
      where: {
        id: existAttendance.id,
      },
      data: {
        ...state,
        ...(payload.comment !== undefined ? { comment: payload.comment } : {}),
        teacherId: currentUser.role == Role.TEACHER ? currentUser.id : null,
        userId: currentUser.role != Role.TEACHER ? currentUser.id : null,
      },
    });

    return {
      success: true,
      message: 'Attendance updated successfully',
    };
  }
}
