import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { AttendanceStatus, Role } from '@prisma/client';
import { OrgAccessService } from 'src/common/utils/org-access.service';
import { isSuperAdmin, orgFilter } from 'src/common/utils/org-scope.util';
import type { RequestUser } from 'src/common/guard/current-user.decorator';

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

  constructor(
    private prisma: PrismaService,
    private orgAccess: OrgAccessService,
  ) {}

  async getAttendanceByLesson(lessonId: number, currentUser: RequestUser) {
    /*
      Ilgari bu metod so'rov egasini umuman bilmasdi: rol darajasidagi ruxsat
      (o'qituvchi yoki admin) yetarli deb hisoblanardi. Natijada boshqa
      tashkilotning `lessonId` si bilan uning davomat jurnali — o'quvchilar
      ismi va rasmigacha — ochilib ketardi.
    */
    await this.orgAccess.assertLessonAccess(currentUser, lessonId);

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
  async getWeeklyStats(currentUser: RequestUser, groupId?: number) {
    const since = new Date();
    since.setDate(since.getDate() - 6);
    since.setHours(0, 0, 0, 0);

    // Aniq guruh so'ralgan bo'lsa — u so'rov egasiga tegishlimi.
    if (groupId) {
      await this.orgAccess.assertGroupAccess(currentUser, groupId);
    }

    /*
      Guruh ko'rsatilmasa statistika hamma guruh bo'yicha chiqadi. Ilgari bu
      "hamma" so'zma-so'z hamma tashkilotni bildirardi: bitta markaz admini
      boshqa markazlarning davomat ko'rsatkichini ko'rardi. Endi doim
      o'zining tashkiloti (o'qituvchi uchun esa o'z guruhlari) bilan
      cheklanadi.
    */
    const scope = isSuperAdmin(currentUser)
      ? {}
      : currentUser?.role === Role.TEACHER
        ? { lesson: { group: { teacherId: currentUser.id } } }
        : { lesson: { group: orgFilter(currentUser) } };

    const records = await this.prisma.attendance.findMany({
      where: {
        created_at: { gte: since },
        ...(groupId ? { lesson: { groupId } } : scope),
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
    currentUser: RequestUser,
  ) {
    const lesson = await this.orgAccess.assertLessonAccess(
      currentUser,
      payload.lessonId,
    );

    const existStudent = await this.prisma.student.findUnique({
      where: {
        id: payload.studentId,
        status: 'ACTIVE',
      },
    });
    if (!existStudent) {
      throw new NotFoundException('Student not found with this id');
    }

    // O'quvchi shu darsning guruhida bo'lishi shart: aks holda begona
    // o'quvchiga ham davomat yozib qo'yish mumkin edi.
    await this.orgAccess.assertStudentInGroup(
      payload.studentId,
      lesson.groupId,
    );

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
    currentUser: RequestUser,
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

    await this.orgAccess.assertLessonAccess(currentUser, payload.lessonId);

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
