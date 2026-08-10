import { HomeworkStatus, Role } from '@prisma/client';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { HomeworkStatusDto } from './dto/homework.status.dto';
import { UpdateHomeworkDto } from './dto/update-homework.dto';
import { OrgAccessService } from 'src/common/utils/org-access.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';

@Injectable()
export class HomeworkService {
  constructor(
    private prisma: PrismaService,
    private orgAccess: OrgAccessService,
  ) {}

  async getHomeworkById(
    homeworkId: number,
    query: HomeworkStatusDto,
    currentUser: RequestUser,
  ) {
    /*
      Ilgari bu yerda o'quvchi uchun `homework.userId !== currentUser.id`
      tekshiruvi turardi. `Homework.userId` — vazifani YARATGAN xodim (User
      jadvali), o'quvchi emas. Jadvallarning ID hisoblagichi alohida bo'lgani
      uchun bu solishtiruv tasodifan mos kelgan raqamlarda o'tib ketardi va
      mos kelmaganda haqiqiy egasini ham to'sardi — ya'ni har ikki tomonga
      xato edi. To'g'ri savol: o'quvchi shu vazifaning guruhida bormi.
    */
    const existHomework = await this.prisma.homework.findUnique({
      where: {
        id: homeworkId,
      },
    });

    if (!existHomework) {
      throw new NotFoundException('Homework not found');
    }

    await this.orgAccess.assertGroupAccess(currentUser, existHomework.groupId);

    if (query.status === HomeworkStatus.PENDING) {
      const reviewedStudentIds = await this.prisma.homeworkResult.findMany({
        where: {
          homeworkId,
        },
        select: {
          studentId: true,
        },
      });

      const homeworkResponse = await this.prisma.homeworkResponse.findMany({
        where: {
          homeworkId,
          studentId: {
            notIn: reviewedStudentIds.map((item) => item.studentId),
          },
        },
        select: {
          id: true,
          homeworkId: true,
          studentId: true,
          title: true,
          created_at: true,
          student: {
            select: {
              id: true,
              fullName: true,
            },
          },
        },
      });

      return {
        success: true,
        data: homeworkResponse,
      };
    }

    if (query.status === HomeworkStatus.NOT_REVIEWED) {
      const allHomeworkResponses = await this.prisma.homeworkResponse.findMany({
        where: {
          homeworkId,
        },
        select: {
          studentId: true,
        },
      });

      const submittedStudentIds = allHomeworkResponses.map(
        (response) => response.studentId,
      );
      const notSubmittedStudents = await this.prisma.student.findMany({
        where: {
          studentGroups: {
            some: {
              groupId: existHomework.groupId,
              status: 'ACTIVE',
            },
          },
          id: {
            notIn: submittedStudentIds,
          },
        },
        select: {
          id: true,
          fullName: true,
        },
      });

      return {
        success: true,
        data: notSubmittedStudents,
      };
    }

    if (query.status === HomeworkStatus.REJECTED) {
      const rejectedResults = await this.prisma.homeworkResult.findMany({
        where: {
          homeworkId,
          status: HomeworkStatus.REJECTED,
        },
        select: {
          id: true,
          homeworkId: true,
          studentId: true,
          student: {
            select: {
              id: true,
              fullName: true,
            },
          },
          score: true,
          title: true,
          comment: true,
          created_at: true,
        },
      });

      return {
        success: true,
        data: rejectedResults,
      };
    }

    if (query.status === HomeworkStatus.APPROVED) {
      const approvedResults = await this.prisma.homeworkResult.findMany({
        where: {
          homeworkId,
          status: HomeworkStatus.APPROVED,
        },
        select: {
          id: true,
          homeworkId: true,
          studentId: true,
          student: {
            select: {
              id: true,
              fullName: true,
            },
          },
          score: true,
          title: true,
          comment: true,
          created_at: true,
        },
      });
      return {
        success: true,
        data: approvedResults,
      };
    }

    return {
      success: true,
      data: existHomework,
    };
  }

  async getAllHomeworkByGroup(groupId: number, currentUser: RequestUser) {
    await this.orgAccess.assertGroupAccess(currentUser, groupId);

    const homeworks = await this.prisma.homework.findMany({
      where: {
        groupId,
      },
      select: {
        id: true,
        title: true,
        lessonId: true,
        file: true,
        durationTime: true,
        created_at: true,
        lesson: {
          select: {
            id: true,
            title: true,
            created_at: true,
          },
        },
        _count: {
          select: {
            homeworkResponses: true,
            homeworkResults: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    return {
      success: true,
      data: homeworks,
    };
  }

  async createHomework(
    payload: any,
    currentUser: RequestUser,
    filename?: string,
  ) {
    await this.orgAccess.assertGroupAccess(currentUser, payload.groupId, {
      requireActive: true,
    });

    const existLesson = await this.prisma.lesson.findUnique({
      where: {
        id: payload.lessonId,
      },
    });

    if (!existLesson) {
      throw new NotFoundException('Lesson not found with this id');
    }

    if (existLesson.groupId != payload.groupId) {
      throw new ForbiddenException('Bu dars shu guruhga tegishli emas');
    }

    await this.prisma.homework.create({
      data: {
        title: payload.title,
        file: filename,
        durationTime: payload.durationTime ?? 16,
        groupId: payload.groupId,
        lessonId: payload.lessonId,
        /*
          `userId` — User jadvaliga FK, ya'ni unga faqat xodim raqami
          yozilishi mumkin. Ilgari bu yerda `role === STUDENT` sharti turardi:
          o'quvchi bu endpointga umuman kira olmaydi, shuning uchun amalda
          har doim `null` yozilib, vazifani kim yaratgani yo'qolardi.
        */
        teacherId: currentUser.role === Role.TEACHER ? currentUser.id : null,
        userId: currentUser.role === Role.TEACHER ? null : currentUser.id,
      },
    });

    return {
      success: true,
      message: 'Homework created successfully',
    };
  }

  async updateHomework(
    homeworkId: number,
    payload: UpdateHomeworkDto,
    currentUser: RequestUser,
    filename?: string,
  ) {
    const existHomework = await this.prisma.homework.findUnique({
      where: {
        id: homeworkId,
      },
    });

    if (!existHomework) {
      throw new NotFoundException('Homework not found with this id');
    }

    // Vazifaning O'ZI so'rov egasiga tegishlimi.
    await this.orgAccess.assertHomeworkAccess(currentUser, homeworkId);

    const targetGroupId = payload.groupId ?? existHomework.groupId;
    const targetLessonId = payload.lessonId ?? existHomework.lessonId;

    // Vazifa boshqa guruhga ko'chirilayotgan bo'lsa, YANGI guruh ham
    // tekshiriladi: aks holda uni begona guruhga surib yuborish mumkin edi.
    await this.orgAccess.assertGroupAccess(currentUser, targetGroupId, {
      requireActive: true,
    });

    const existLesson = await this.prisma.lesson.findUnique({
      where: {
        id: targetLessonId,
      },
    });

    if (!existLesson) {
      throw new NotFoundException('Lesson not found with this id');
    }

    if (existLesson.groupId !== targetGroupId) {
      throw new BadRequestException('Bu dars shu guruhga tegishli emas');
    }

    await this.prisma.homework.update({
      where: {
        id: homeworkId,
      },
      data: {
        title: payload.title,
        groupId: payload.groupId,
        lessonId: payload.lessonId,
        durationTime: payload.durationTime,
        file: filename ?? undefined,
      },
    });

    return {
      success: true,
      message: 'Homework updated successfully',
    };
  }

  async updateHomeworkByTeacher(
    homeworkId: number,
    payload: UpdateHomeworkDto,
    currentUser: RequestUser,
    filename?: string,
  ) {
    if (currentUser.role !== Role.TEACHER) {
      throw new ForbiddenException('Faqat teacher update qila oladi');
    }

    return this.updateHomework(homeworkId, payload, currentUser, filename);
  }

  async deleteHomework(homeworkId: number, currentUser: RequestUser) {
    /*
      Ilgari bu yerda faqat o'qituvchi tekshirilardi: boshqa tashkilotning
      admini begona `homeworkId` ni yuborib, uni javoblari bilan birga
      o'chirib yuborishi mumkin edi.
    */
    await this.orgAccess.assertHomeworkAccess(currentUser, homeworkId);

    await this.prisma.$transaction([
      this.prisma.homeworkResult.deleteMany({ where: { homeworkId } }),
      this.prisma.homeworkResponse.deleteMany({ where: { homeworkId } }),
      this.prisma.homework.delete({ where: { id: homeworkId } }),
    ]);

    return {
      success: true,
      message: 'Homework deleted successfully',
    };
  }
}
