import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../guard/current-user.decorator';
import { isSuperAdmin } from './org-scope.util';

/**
 * Dars, imtihon, uy vazifa, davomat va baho — hammasi guruhga (yoki
 * o'quvchiga) bog'langan, ya'ni ularning tashkiloti guruh orqali aniqlanadi.
 *
 * Ro'yxatlar allaqachon tashkilot bo'yicha filtrlanadi, lekin bu yetarli emas:
 * kimdir boshqa tashkilotning `groupId` sini qo'lda yuborsa, ma'lumot ochilib
 * ketardi. Shuning uchun id qabul qiladigan endpointlar shu yerdagi
 * tekshiruvdan o'tadi.
 *
 * Topilmagan va begona yozuv bir xil xato beradi — boshqa tashkilotda bu id
 * borligi ham oshkor bo'lmasin.
 */
@Injectable()
export class OrgAccessService {
  constructor(private prisma: PrismaService) {}

  /** Guruh so'rov egasining tashkilotiga tegishlimi. */
  async assertGroup(user: RequestUser, groupId: number) {
    if (isSuperAdmin(user)) return;

    const group = await this.prisma.group.findFirst({
      where: { id: Number(groupId), organizationId: user?.organizationId ?? null },
      select: { id: true },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }
  }

  /** Dars — guruhi orqali tekshiriladi. */
  async assertLesson(user: RequestUser, lessonId: number) {
    if (isSuperAdmin(user)) return;

    const lesson = await this.prisma.lesson.findFirst({
      where: {
        id: Number(lessonId),
        group: { organizationId: user?.organizationId ?? null },
      },
      select: { id: true },
    });

    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }
  }

  /** Imtihon — guruhi orqali tekshiriladi. */
  async assertExam(user: RequestUser, examId: number) {
    if (isSuperAdmin(user)) return;

    const exam = await this.prisma.exam.findFirst({
      where: {
        id: Number(examId),
        group: { organizationId: user?.organizationId ?? null },
      },
      select: { id: true },
    });

    if (!exam) {
      throw new NotFoundException('Exam not found');
    }
  }

  /** Uy vazifa — guruhi orqali tekshiriladi. */
  async assertHomework(user: RequestUser, homeworkId: number) {
    if (isSuperAdmin(user)) return;

    // `Homework` da `groupId` bor, lekin `group` munosabati yo'q — shuning
    // uchun tashkilot dars orqali aniqlanadi.
    const homework = await this.prisma.homework.findFirst({
      where: {
        id: Number(homeworkId),
        lesson: { group: { organizationId: user?.organizationId ?? null } },
      },
      select: { id: true },
    });

    if (!homework) {
      throw new NotFoundException('Homework not found');
    }
  }

  /** O'quvchi so'rov egasining tashkilotidami. */
  async assertStudent(user: RequestUser, studentId: number) {
    if (isSuperAdmin(user)) return;

    const student = await this.prisma.student.findFirst({
      where: {
        id: Number(studentId),
        organizationId: user?.organizationId ?? null,
      },
      select: { id: true },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }
  }
}
