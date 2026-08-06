import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { CreateGradeDto } from './dto/create-grade.dto';
import { UpdateGradeDto } from './dto/update-grade.dto';
import { orgFilter } from 'src/common/utils/org-scope.util';
import type { RequestUser } from 'src/common/guard/current-user.decorator';

type CurrentUser = RequestUser;

@Injectable()
export class GradesService {
  constructor(private prisma: PrismaService) {}

  async getByGroup(groupId: number, currentUser: CurrentUser) {
    await this.ensureGroupAccess(groupId, currentUser);

    const grades = await this.prisma.grade.findMany({
      where: { groupId },
      include: {
        student: { select: { id: true, fullName: true, photo: true } },
        lesson: { select: { id: true, title: true } },
      },
      orderBy: { date: 'desc' },
    });

    return { success: true, data: grades, ...this.buildStats(grades) };
  }

  async getByStudent(studentId: number, currentUser: CurrentUser) {
    if (currentUser.role === Role.STUDENT && currentUser.id !== studentId) {
      throw new ForbiddenException('Bu sizning baholaringiz emas');
    }

    const grades = await this.prisma.grade.findMany({
      where: { studentId },
      include: {
        group: { select: { id: true, name: true } },
        lesson: { select: { id: true, title: true } },
      },
      orderBy: { date: 'desc' },
    });

    return { success: true, data: grades, ...this.buildStats(grades) };
  }

  async getMine(currentUser: CurrentUser) {
    return this.getByStudent(currentUser.id, currentUser);
  }

  async create(payload: CreateGradeDto, currentUser: CurrentUser) {
    await this.ensureGroupAccess(payload.groupId, currentUser);
    await this.ensureStudentInGroup(payload.studentId, payload.groupId);

    const grade = await this.prisma.grade.create({
      data: {
        studentId: payload.studentId,
        groupId: payload.groupId,
        lessonId: payload.lessonId,
        examId: payload.examId,
        type: payload.type,
        score: payload.score,
        maxScore: payload.maxScore ?? 100,
        comment: payload.comment,
        date: payload.date ? new Date(payload.date) : new Date(),
        teacherId: currentUser.role === Role.TEACHER ? currentUser.id : null,
        userId: currentUser.role === Role.TEACHER ? null : currentUser.id,
      },
      include: {
        student: { select: { id: true, fullName: true } },
      },
    });

    return { success: true, message: "Baho qo'yildi", data: grade };
  }

  async update(id: number, payload: UpdateGradeDto, currentUser: CurrentUser) {
    const grade = await this.prisma.grade.findUnique({
      where: { id },
      select: { id: true, groupId: true },
    });

    if (!grade) {
      throw new NotFoundException('Baho topilmadi');
    }

    await this.ensureGroupAccess(grade.groupId, currentUser);

    const updated = await this.prisma.grade.update({
      where: { id },
      data: {
        ...(payload.score !== undefined ? { score: payload.score } : {}),
        ...(payload.maxScore !== undefined
          ? { maxScore: payload.maxScore }
          : {}),
        ...(payload.comment !== undefined ? { comment: payload.comment } : {}),
        ...(payload.type ? { type: payload.type } : {}),
        ...(payload.date ? { date: new Date(payload.date) } : {}),
      },
    });

    return { success: true, message: 'Baho yangilandi', data: updated };
  }

  async remove(id: number, currentUser: CurrentUser) {
    const grade = await this.prisma.grade.findUnique({
      where: { id },
      select: { id: true, groupId: true },
    });

    if (!grade) {
      throw new NotFoundException('Baho topilmadi');
    }

    await this.ensureGroupAccess(grade.groupId, currentUser);
    await this.prisma.grade.delete({ where: { id } });

    return { success: true, message: "Baho o'chirildi" };
  }

  private buildStats(grades: { score: number; maxScore: number }[]) {
    if (grades.length === 0) {
      return { average: 0, averagePercent: 0 };
    }

    const totalScore = grades.reduce((sum, item) => sum + item.score, 0);
    const totalMax = grades.reduce(
      (sum, item) => sum + (item.maxScore || 100),
      0,
    );

    return {
      average: Math.round((totalScore / grades.length) * 10) / 10,
      averagePercent: totalMax ? Math.round((totalScore / totalMax) * 100) : 0,
    };
  }

  private async ensureGroupAccess(groupId: number, currentUser: CurrentUser) {
    // Guruh so'rov egasining tashkilotidami — begonasi "topilmadi" bo'ladi.
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, ...orgFilter(currentUser) },
      select: { id: true, teacherId: true },
    });

    if (!group) {
      throw new NotFoundException('Guruh topilmadi');
    }

    if (
      currentUser.role === Role.TEACHER &&
      group.teacherId !== currentUser.id
    ) {
      throw new ForbiddenException('Bu sizning guruhingiz emas');
    }

    if (currentUser.role === Role.STUDENT) {
      const membership = await this.prisma.studentGroup.findFirst({
        where: { groupId, studentId: currentUser.id, status: 'ACTIVE' },
        select: { id: true },
      });

      if (!membership) {
        throw new ForbiddenException('Bu sizning guruhingiz emas');
      }
    }
  }

  private async ensureStudentInGroup(studentId: number, groupId: number) {
    const membership = await this.prisma.studentGroup.findFirst({
      where: { studentId, groupId, status: 'ACTIVE' },
      select: { id: true },
    });

    if (!membership) {
      throw new NotFoundException("O'quvchi bu guruhda emas");
    }
  }
}
