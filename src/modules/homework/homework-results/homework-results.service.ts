import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { CreateHomeworkResultsDto } from './dto/create.results.dto';
import { HomeworkStatus, Role } from '@prisma/client';

@Injectable()
export class HomeworkResultsService {
  constructor(private prisma: PrismaService) {}

  async createHomeworkResult(
    payload: CreateHomeworkResultsDto,
    currentUser: { id: number; role: Role },
  ) {
    const existHomework = await this.prisma.homework.findUnique({
      where: {
        id: payload.homeworkId,
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

    await this.prisma.homeworkResult.create({
      data: {
        title: payload.title,
        score: payload.score,
        homeworkId: payload.homeworkId,
        studentId: payload.studentId,
        teacherId: currentUser.role === Role.TEACHER ? currentUser.id : null,
        userId: currentUser.role === Role.STUDENT ? currentUser.id : null,
        status:
          payload.score >= 60
            ? HomeworkStatus.APPROVED
            : HomeworkStatus.REJECTED,
      },
    });

    return {
      success: true,
      message: 'Homework result created successfully',
    };
  }

  async getHomeworkResultsByHomeworkId(
    homeworkId: number,
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

    const homeworkResults = await this.prisma.homeworkResult.findMany({
      where: {
        homeworkId,
      },
      select: {
        id: true,
        title: true,
        score: true,
        status: true,
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
      data: homeworkResults,
    };
  }

  async updateHomeworkResult(
    payload: CreateHomeworkResultsDto & { id: number },
    currentUser: { id: number; role: Role },
  ) {
    const existHomeworkResult = await this.prisma.homeworkResult.findUnique({
      where: {
        id: payload.id,
      },
    });

    if (!existHomeworkResult) {
      throw new NotFoundException('Homework result not found');
    }

    const existHomework = await this.prisma.homework.findUnique({
      where: {
        id: payload.homeworkId,
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

    await this.prisma.homeworkResult.update({
      where: {
        id: payload.id,
      },
      data: {
        title: payload.title,
        score: payload.score,
        homeworkId: payload.homeworkId,
        studentId: payload.studentId,
        teacherId: currentUser.role === Role.TEACHER ? currentUser.id : null,
        userId: currentUser.role === Role.STUDENT ? currentUser.id : null,
        status:
          payload.score >= 60
            ? HomeworkStatus.APPROVED
            : HomeworkStatus.REJECTED,
      },
    });

    return {
      success: true,
      message: 'Homework result updated successfully',
    };
  }
}
