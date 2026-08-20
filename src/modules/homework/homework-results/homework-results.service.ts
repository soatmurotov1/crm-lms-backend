import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { CreateHomeworkResultsDto } from './dto/create.results.dto';
import { HomeworkStatus, Role } from '@prisma/client';
import { OrgAccessService } from 'src/common/utils/org-access.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';

@Injectable()
export class HomeworkResultsService {
  constructor(
    private prisma: PrismaService,
    private orgAccess: OrgAccessService,
  ) {}

  /**
   * Ilgari bu tekshiruv o'qituvchi bo'lmagan hammani darrov o'tkazib
   * yuborardi (`role !== TEACHER` bo'lsa `return`). Ya'ni boshqa
   * tashkilotning admini begona `homeworkId` ga baho qo'ya olardi.
   */
  private async assertHomeworkAccess(
    homeworkId: number,
    currentUser: RequestUser,
  ) {
    return this.orgAccess.assertHomeworkAccess(currentUser, homeworkId);
  }

  async createHomeworkResult(
    payload: CreateHomeworkResultsDto,
    currentUser: RequestUser,
  ) {
    const existHomework = await this.prisma.homework.findUnique({
      where: {
        id: payload.homeworkId,
      },
    });

    if (!existHomework) {
      throw new NotFoundException('Homework not found');
    }

    const homework = await this.assertHomeworkAccess(
      payload.homeworkId,
      currentUser,
    );

    // Baho qo'yilayotgan o'quvchi ham shu vazifaning guruhida bo'lishi kerak.
    await this.orgAccess.assertStudentInGroup(
      payload.studentId,
      homework.groupId,
    );

    const submittedResponse = await this.prisma.homeworkResponse.findFirst({
      where: {
        homeworkId: payload.homeworkId,
        studentId: payload.studentId,
      },
      select: { id: true },
    });

    if (!submittedResponse) {
      throw new BadRequestException(
        "Bu o'quvchi hali uyga vazifa topshirmagan",
      );
    }

    const existingResult = await this.prisma.homeworkResult.findFirst({
      where: {
        homeworkId: payload.homeworkId,
        studentId: payload.studentId,
      },
      orderBy: { id: 'desc' },
      select: { id: true },
    });

    if (existingResult) {
      await this.prisma.homeworkResult.update({
        where: {
          id: existingResult.id,
        },
        data: {
          title: payload.title,
          comment: payload.comment ?? null,
          score: payload.score,
          homeworkId: payload.homeworkId,
          studentId: payload.studentId,
          teacherId: currentUser.role === Role.TEACHER ? currentUser.id : null,
          userId: currentUser.role !== Role.TEACHER ? currentUser.id : null,
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

    await this.prisma.homeworkResult.create({
      data: {
        title: payload.title,
        comment: payload.comment ?? null,
        score: payload.score,
        homeworkId: payload.homeworkId,
        studentId: payload.studentId,
        teacherId: currentUser.role === Role.TEACHER ? currentUser.id : null,
        userId: currentUser.role !== Role.TEACHER ? currentUser.id : null,
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
    currentUser: RequestUser,
  ) {
    const existHomework = await this.prisma.homework.findUnique({
      where: {
        id: homeworkId,
      },
    });

    if (!existHomework) {
      throw new NotFoundException('Homework not found');
    }

    await this.assertHomeworkAccess(homeworkId, currentUser);

    const homeworkResults = await this.prisma.homeworkResult.findMany({
      where: {
        homeworkId,
      },
      select: {
        id: true,
        title: true,
        comment: true,
        score: true,
        status: true,
        student: {
          select: {
            id: true,
            fullName: true,
          },
        },
        teacher: {
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
    currentUser: RequestUser,
  ) {
    const existHomeworkResult = await this.prisma.homeworkResult.findUnique({
      where: {
        id: payload.id,
      },
    });

    if (!existHomeworkResult) {
      throw new NotFoundException('Homework result not found');
    }

    /*
      Ruxsat tekshiruvi YANGILANAYOTGAN yozuv bo'yicha bo'lishi kerak.

      Ilgari bu yerda faqat `payload.homeworkId` tekshirilardi — ya'ni
      so'rovda kelgan yangi qiymat. Natijada bir tashkilotning o'qituvchisi
      `id` maydoniga BOSHQA tashkilotdagi natijaning raqamini, `homeworkId`
      ga esa o'zining vazifasini yozib yuborishi mumkin edi: tekshiruv
      o'zining vazifasidan o'tardi, `update` esa begona yozuvni o'zgartirib,
      uni o'z guruhiga bog'lab qo'yardi.

      Natijani boshqa vazifaga ko'chirish qonuniy amal ham emas, shuning
      uchun `homeworkId` ning o'zgarishi ham taqiqlanadi.
    */
    if (existHomeworkResult.homeworkId !== payload.homeworkId) {
      throw new BadRequestException(
        'Natijani boshqa uy vazifasiga ko‘chirib bo‘lmaydi',
      );
    }

    /*
      Ruxsat tekshiruvi boshqa har qanday so'rovdan OLDIN turadi.

      Bu yerda ilgari `homework.findUnique` chaqirilardi va vazifa topilmasa
      "Homework not found" qaytarardi — ya'ni ruxsati yo'q odam ham begona
      vazifa mavjudligini javob matni orqali bilib olardi. Tekshiruvning
      o'zi (`assertHomeworkAccess`) vazifani baribir o'qiydi va topilmasa
      xuddi shu xatoni beradi, shuning uchun alohida so'rov ortiqcha ham edi.
    */
    await this.assertHomeworkAccess(
      existHomeworkResult.homeworkId,
      currentUser,
    );

    const submittedResponse = await this.prisma.homeworkResponse.findFirst({
      where: {
        homeworkId: payload.homeworkId,
        studentId: payload.studentId,
      },
      select: { id: true },
    });

    if (!submittedResponse) {
      throw new BadRequestException(
        "Bu o'quvchi hali uyga vazifa topshirmagan",
      );
    }

    await this.prisma.homeworkResult.update({
      where: {
        id: payload.id,
      },
      data: {
        title: payload.title,
        comment: payload.comment ?? null,
        score: payload.score,
        homeworkId: payload.homeworkId,
        studentId: payload.studentId,
        teacherId: currentUser.role === Role.TEACHER ? currentUser.id : null,
        userId: currentUser.role !== Role.TEACHER ? currentUser.id : null,
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

  async getMyHomeworkResult(homeworkId: number, currentUser: { id: number }) {
    const existHomework = await this.prisma.homework.findUnique({
      where: {
        id: homeworkId,
      },
      select: {
        id: true,
        groupId: true,
      },
    });

    if (!existHomework) {
      throw new NotFoundException('Homework not found');
    }

    const result = await this.prisma.homeworkResult.findFirst({
      where: {
        homeworkId,
        studentId: currentUser.id,
      },
      orderBy: {
        id: 'desc',
      },
      select: {
        id: true,
        title: true,
        comment: true,
        score: true,
        status: true,
        created_at: true,
        updated_at: true,
        teacher: {
          select: {
            id: true,
            fullName: true,
          },
        },
        user: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    });

    return {
      success: true,
      data: result || null,
    };
  }
}
