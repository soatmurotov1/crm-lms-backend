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

@Injectable()
export class HomeworkService {
  constructor(private prisma: PrismaService) {}

  async getHomeworkById(
    homeworkId: number,
    query: HomeworkStatusDto,
    currentUser: { id: number; role: Role },
  ) {
    const existHomework = await this.prisma.homework.findUnique({
      where: {
        id: homeworkId,
      },
    });

    if (!existHomework) {
      throw new NotFoundException('Homework not found');
    }

    if (
      currentUser.role === Role.TEACHER &&
      existHomework.teacherId !== currentUser.id
    ) {
      throw new ForbiddenException('Bu sening homeworking emas');
    }

    if (
      currentUser.role === Role.STUDENT &&
      existHomework.userId !== currentUser.id
    ) {
      throw new ForbiddenException('Bu sening homeworking emas');
    }

    if (query.status === HomeworkStatus.PENDING) {
      const homeworkResponse = await this.prisma.homeworkResponse.findMany({
        where: {
          homeworkId,
        },
        select: {
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
          student: {
            select: {
              id: true,
              fullName: true,
            },
          },
          score: true,
          title: true,
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
          student: {
            select: {
              id: true,
              fullName: true,
            },
          },
          score: true,
          title: true,
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

  async getAllHomeworkByGroup(
    groupId: number,
    currentUser: { id: number; role: Role },
  ) {
    const existGroup = await this.prisma.group.findUnique({
      where: {
        id: groupId,
        status: 'ACTIVE',
      },
    });

    if (!existGroup) {
      throw new NotFoundException('Group not found');
    }

    if (
      currentUser.role === Role.TEACHER &&
      existGroup.teacherId !== currentUser.id
    ) {
      throw new ForbiddenException('Bu sening guruhing emas');
    }
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
    currentUser: { id: number; role: string },
    filename?: string,
  ) {
    const existGroup = await this.prisma.group.findUnique({
      where: {
        id: payload.groupId,
        status: 'ACTIVE',
      },
    });

    if (!existGroup) {
      throw new NotFoundException('Group not found');
    }

    if (
      currentUser.role == Role.TEACHER &&
      existGroup.teacherId != currentUser.id
    ) {
      throw new ForbiddenException('Bu sening guruhing emas');
    }

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
        teacherId: currentUser.role === Role.TEACHER ? currentUser.id : null,
        userId: currentUser.role === Role.STUDENT ? currentUser.id : null,
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
    currentUser: { id: number; role: Role },
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

    if (
      currentUser.role === Role.TEACHER &&
      existHomework.teacherId !== currentUser.id
    ) {
      throw new ForbiddenException('Bu sening homeworking emas');
    }

    const targetGroupId = payload.groupId ?? existHomework.groupId;
    const targetLessonId = payload.lessonId ?? existHomework.lessonId;

    const existGroup = await this.prisma.group.findUnique({
      where: {
        id: targetGroupId,
        status: 'ACTIVE',
      },
    });

    if (!existGroup) {
      throw new NotFoundException('Group not found');
    }

    if (
      currentUser.role === Role.TEACHER &&
      existGroup.teacherId !== currentUser.id
    ) {
      throw new ForbiddenException('Bu sening guruhing emas');
    }

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
    currentUser: { id: number; role: Role },
    filename?: string,
  ) {
    if (currentUser.role !== Role.TEACHER) {
      throw new ForbiddenException('Faqat teacher update qila oladi');
    }

    return this.updateHomework(homeworkId, payload, currentUser, filename);
  }

  async deleteHomework(
    homeworkId: number,
    currentUser: { id: number; role: Role },
  ) {
    const existHomework = await this.prisma.homework.findUnique({
      where: { id: homeworkId },
      select: { id: true, teacherId: true },
    });

    if (!existHomework) {
      throw new NotFoundException('Homework not found with this id');
    }

    if (
      currentUser.role === Role.TEACHER &&
      existHomework.teacherId !== currentUser.id
    ) {
      throw new ForbiddenException('Bu sening homeworking emas');
    }

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
