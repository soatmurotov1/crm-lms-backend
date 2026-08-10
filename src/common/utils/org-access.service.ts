import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, Status } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../guard/current-user.decorator';
import { isSuperAdmin, orgFilter } from './org-scope.util';

/**
 * "Kim" emas, "nimaga" degan savolga javob beradigan tekshiruvlar.
 *
 * Rol darajasidagi ruxsat (`RolesGuard`) faqat "bu odam o'qituvchimi" deydi.
 * Undan keyin qoladigan savol — "aynan SHU guruh/dars/imtihon unga
 * tegishlimi" — shu yerda, bitta joyda javob topadi. Ilgari har modul o'z
 * nusxasini yozardi: uchtasida bor edi, uchtasida esa unutilgan.
 *
 * Qoidalar:
 *  - SUPERADMIN — platforma egasi, hammasini ko'radi;
 *  - ADMIN va boshqa xodimlar — faqat o'z tashkiloti ichida;
 *  - TEACHER — faqat o'ziga biriktirilgan guruhlar;
 *  - STUDENT — faqat o'zi ACTIVE a'zo bo'lgan guruhlar.
 *
 * Topilmagan va begona yozuv bir xil xato beradi — boshqa tashkilotda bu id
 * borligi ham oshkor bo'lmasin.
 */
@Injectable()
export class OrgAccessService {
  constructor(private prisma: PrismaService) {}

  /**
   * Guruhga kirish huquqi. Qaytadigan qiymat chaqiruvchiga kerak bo'ladi
   * (masalan `teacherId`), shuning uchun guruh o'zi qaytariladi.
   *
   * `requireActive` — yangi yozuv qo'shadigan joylar uchun: muzlatilgan yoki
   * arxivlangan guruhga dars, vazifa yoki video qo'shib bo'lmaydi. O'qish
   * uchun bu shart qo'yilmaydi, aks holda arxivdagi guruhning tarixi ham
   * ko'rinmay qolardi.
   */
  async assertGroupAccess(
    user: RequestUser,
    groupId: number,
    options: { requireActive?: boolean } = {},
  ): Promise<{ id: number; teacherId: number | null }> {
    const group = await this.prisma.group.findFirst({
      where: {
        id: Number(groupId),
        ...(options.requireActive ? { status: Status.ACTIVE } : {}),
        ...orgFilter(user),
      },
      select: { id: true, teacherId: true },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    if (user?.role === Role.TEACHER && group.teacherId !== user.id) {
      throw new ForbiddenException('Bu sizning guruhingiz emas');
    }

    if (user?.role === Role.STUDENT) {
      await this.assertStudentInGroup(user.id, group.id);
    }

    return group;
  }

  /** Dars — guruhi orqali tekshiriladi. */
  async assertLessonAccess(
    user: RequestUser,
    lessonId: number,
  ): Promise<{ id: number; groupId: number }> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: Number(lessonId) },
      select: { id: true, groupId: true },
    });

    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }

    await this.assertGroupAccess(user, lesson.groupId);

    return lesson;
  }

  /** Uy vazifa — o'z `groupId` si orqali tekshiriladi. */
  async assertHomeworkAccess(
    user: RequestUser,
    homeworkId: number,
  ): Promise<{ id: number; groupId: number; lessonId: number }> {
    const homework = await this.prisma.homework.findUnique({
      where: { id: Number(homeworkId) },
      select: { id: true, groupId: true, lessonId: true },
    });

    if (!homework) {
      throw new NotFoundException('Homework not found');
    }

    await this.assertGroupAccess(user, homework.groupId);

    return homework;
  }

  /** Imtihon — guruhi orqali tekshiriladi. */
  async assertExamAccess(
    user: RequestUser,
    examId: number,
  ): Promise<{ id: number; groupId: number }> {
    const exam = await this.prisma.exam.findUnique({
      where: { id: Number(examId) },
      select: { id: true, groupId: true },
    });

    if (!exam) {
      throw new NotFoundException('Exam not found');
    }

    await this.assertGroupAccess(user, exam.groupId);

    return exam;
  }

  /**
   * O'quvchi ma'lumotiga kirish huquqi.
   *
   * O'quvchining o'zi faqat o'zini ko'radi, o'qituvchi esa faqat o'z
   * guruhidagilarni. Ilgari bu tekshiruv umuman yo'q edi: `studentId` ni
   * qo'lda almashtirib, begona o'quvchining bahosini ochish mumkin edi.
   */
  async assertStudentAccess(user: RequestUser, studentId: number) {
    const id = Number(studentId);

    if (user?.role === Role.STUDENT) {
      /*
        Jadvallar alohida, ID hisoblagichlari ham alohida: 7-raqamli o'quvchi
        ham, 7-raqamli o'qituvchi ham bor. Shuning uchun bu solishtiruv faqat
        rol STUDENT ekani aniqlangandan keyin ma'noga ega.
      */
      if (user.id !== id) {
        throw new ForbiddenException("Bu sizning ma'lumotingiz emas");
      }

      return;
    }

    const student = await this.prisma.student.findFirst({
      where: { id, ...orgFilter(user) },
      select: { id: true },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    if (user?.role === Role.TEACHER) {
      const shared = await this.prisma.studentGroup.findFirst({
        where: {
          studentId: id,
          status: Status.ACTIVE,
          group: { teacherId: user.id },
        },
        select: { id: true },
      });

      if (!shared) {
        throw new ForbiddenException("Bu o'quvchi sizning guruhingizda emas");
      }
    }
  }

  /** O'quvchi guruhning faol a'zosimi. */
  async assertStudentInGroup(studentId: number, groupId: number) {
    const membership = await this.prisma.studentGroup.findFirst({
      where: {
        studentId: Number(studentId),
        groupId: Number(groupId),
        status: Status.ACTIVE,
      },
      select: { id: true },
    });

    if (!membership) {
      throw new ForbiddenException('Bu sizning guruhingiz emas');
    }
  }

  /**
   * Faqat tashkilot darajasidagi tekshiruv — rol muhim bo'lmagan joylar
   * uchun (masalan xodim boshqa tashkilotning guruhiga yozuv qo'shmoqchi).
   */
  async assertGroupInOrg(user: RequestUser, groupId: number) {
    if (isSuperAdmin(user)) return;

    const group = await this.prisma.group.findFirst({
      where: { id: Number(groupId), ...orgFilter(user) },
      select: { id: true },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }
  }
}
