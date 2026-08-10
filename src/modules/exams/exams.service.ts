import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import {
  CloudinaryService,
  DOCUMENT_MIME_TYPES,
} from 'src/common/cloudinary/cloudinary.service';
import { CreateExamDto } from './dto/create-exam.dto';
import { UpdateExamDto } from './dto/update-exam.dto';
import { ExamResponseDto } from './dto/exam-response.dto';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import { OrgAccessService } from 'src/common/utils/org-access.service';

type CurrentUser = RequestUser;

/** Exam kartochkasida frontend kutayotgan maydonlar. */
const examSelect = {
  id: true,
  groupId: true,
  lessonId: true,
  title: true,
  description: true,
  file: true,
  startAt: true,
  endAt: true,
  durationTime: true,
  maxScore: true,
  status: true,
  created_at: true,
  updated_at: true,
  lesson: {
    select: {
      id: true,
      title: true,
    },
  },
  _count: {
    select: {
      responses: true,
      results: true,
    },
  },
};

const responseSelect = {
  id: true,
  examId: true,
  studentId: true,
  title: true,
  comment: true,
  file: true,
  created_at: true,
  updated_at: true,
};

@Injectable()
export class ExamsService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
    private orgAccess: OrgAccessService,
  ) {}

  /**
   * Guruhga kirish huquqini tekshiradi: teacher faqat o'z guruhini,
   * student faqat o'zi a'zo bo'lgan guruhni ko'ra oladi.
   *
   * Tekshiruvning o'zi umumiy `OrgAccessService` da — bir xil qoida uchta
   * modulda uch nusxada yozilgan edi.
   */
  private async assertGroupAccess(groupId: number, currentUser: CurrentUser) {
    return this.orgAccess.assertGroupAccess(currentUser, groupId);
  }

  /** Dars berilgan bo'lsa, u shu guruhga tegishli ekanini tekshiradi. */
  private async assertLessonBelongsToGroup(lessonId: number, groupId: number) {
    const existLesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, groupId: true },
    });

    if (!existLesson) {
      throw new NotFoundException('Lesson not found with this id');
    }

    if (existLesson.groupId !== groupId) {
      throw new BadRequestException('Bu dars shu guruhga tegishli emas');
    }
  }

  private toDate(value?: string): Date | undefined {
    if (!value) return undefined;

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException("Sana formati noto'g'ri");
    }
    return parsed;
  }

  private assertDateRange(startAt?: Date | null, endAt?: Date | null) {
    if (startAt && endAt && startAt.getTime() > endAt.getTime()) {
      throw new BadRequestException(
        "Tugash vaqti boshlanish vaqtidan keyin bo'lishi kerak",
      );
    }
  }

  async getExamsByGroup(groupId: number, currentUser: CurrentUser) {
    await this.assertGroupAccess(groupId, currentUser);

    const exams = await this.prisma.exam.findMany({
      where: { groupId },
      select: examSelect,
      orderBy: { created_at: 'desc' },
    });

    return {
      success: true,
      data: exams,
    };
  }

  async getExamById(examId: number, currentUser: CurrentUser) {
    const existExam = await this.prisma.exam.findUnique({
      where: { id: examId },
      select: examSelect,
    });

    if (!existExam) {
      throw new NotFoundException('Exam not found');
    }

    await this.assertGroupAccess(existExam.groupId, currentUser);

    return {
      success: true,
      data: existExam,
    };
  }

  async createExam(
    payload: CreateExamDto,
    currentUser: CurrentUser,
    fileUrl?: string,
  ) {
    await this.assertGroupAccess(payload.groupId, currentUser);
    await this.assertLessonBelongsToGroup(payload.lessonId, payload.groupId);

    const startAt = this.toDate(payload.startAt) as Date;
    const endAt = this.toDate(payload.endAt) as Date;
    this.assertDateRange(startAt, endAt);

    const exam = await this.prisma.exam.create({
      data: {
        title: payload.title,
        description: payload.description,
        file: fileUrl,
        groupId: payload.groupId,
        lessonId: payload.lessonId,
        startAt,
        endAt,
        dueDate: endAt,
        durationTime: payload.durationTime ?? 60,
        maxScore: payload.maxScore ?? 100,
        teacherId: currentUser.role === Role.TEACHER ? currentUser.id : null,
        userId: currentUser.role === Role.TEACHER ? null : currentUser.id,
      },
      select: examSelect,
    });

    return {
      success: true,
      message: 'Exam created successfully',
      data: exam,
    };
  }

  async updateExam(
    examId: number,
    payload: UpdateExamDto,
    currentUser: CurrentUser,
    fileUrl?: string,
  ) {
    const existExam = await this.prisma.exam.findUnique({
      where: { id: examId },
    });

    if (!existExam) {
      throw new NotFoundException('Exam not found');
    }

    const targetGroupId = payload.groupId ?? existExam.groupId;
    await this.assertGroupAccess(targetGroupId, currentUser);

    const targetLessonId = payload.lessonId ?? existExam.lessonId;
    await this.assertLessonBelongsToGroup(targetLessonId, targetGroupId);

    const startAt = this.toDate(payload.startAt) ?? existExam.startAt;
    const endAt = this.toDate(payload.endAt) ?? existExam.endAt;
    this.assertDateRange(startAt, endAt);

    const exam = await this.prisma.exam.update({
      where: { id: examId },
      data: {
        title: payload.title,
        description: payload.description,
        file: fileUrl ?? undefined,
        groupId: payload.groupId,
        lessonId: payload.lessonId,
        startAt: this.toDate(payload.startAt),
        endAt: this.toDate(payload.endAt),
        dueDate: this.toDate(payload.endAt),
        durationTime: payload.durationTime,
        maxScore: payload.maxScore,
      },
      select: examSelect,
    });

    return {
      success: true,
      message: 'Exam updated successfully',
      data: exam,
    };
  }

  async deleteExam(examId: number, currentUser: CurrentUser) {
    const existExam = await this.prisma.exam.findUnique({
      where: { id: examId },
      select: { id: true, groupId: true },
    });

    if (!existExam) {
      throw new NotFoundException('Exam not found');
    }

    await this.assertGroupAccess(existExam.groupId, currentUser);

    // ExamResponse/ExamResult onDelete: Cascade bo'lsa ham, eski bazalarda
    // constraint yangilanmagan bo'lishi mumkin - qo'lda tozalab ketamiz.
    await this.prisma.$transaction([
      this.prisma.examResult.deleteMany({ where: { examId } }),
      this.prisma.examResponse.deleteMany({ where: { examId } }),
      this.prisma.exam.delete({ where: { id: examId } }),
    ]);

    return {
      success: true,
      message: 'Exam deleted successfully',
    };
  }

  async getMyResponse(examId: number, currentUser: CurrentUser) {
    const existExam = await this.prisma.exam.findUnique({
      where: { id: examId },
      select: { id: true, groupId: true },
    });

    if (!existExam) {
      throw new NotFoundException('Exam not found');
    }

    await this.assertGroupAccess(existExam.groupId, currentUser);

    const response = await this.prisma.examResponse.findFirst({
      where: { examId, studentId: currentUser.id },
      orderBy: { id: 'desc' },
      select: responseSelect,
    });

    return {
      success: true,
      data: response,
    };
  }

  async getStudentResponse(
    examId: number,
    studentId: number,
    currentUser: CurrentUser,
  ) {
    const existExam = await this.prisma.exam.findUnique({
      where: { id: examId },
      select: { id: true, groupId: true },
    });

    if (!existExam) {
      throw new NotFoundException('Exam not found');
    }

    await this.assertGroupAccess(existExam.groupId, currentUser);

    const response = await this.prisma.examResponse.findFirst({
      where: { examId, studentId },
      orderBy: { id: 'desc' },
      select: {
        ...responseSelect,
        student: {
          select: {
            id: true,
            fullName: true,
            phone: true,
          },
        },
      },
    });

    if (!response) {
      throw new NotFoundException('Exam response not found');
    }

    return {
      success: true,
      data: response,
    };
  }

  /** Topshirish oynasidan tashqarida (erta yoki kech) yuborishni bloklaydi. */
  private assertSubmissionWindow(exam: { startAt: Date; endAt: Date }) {
    const now = Date.now();

    if (exam.startAt && now < new Date(exam.startAt).getTime()) {
      throw new BadRequestException('Exam hali boshlanmagan');
    }

    if (exam.endAt && now > new Date(exam.endAt).getTime()) {
      throw new BadRequestException('Exam vaqti tugagan');
    }
  }

  async createResponse(
    payload: ExamResponseDto,
    currentUser: CurrentUser,
    file?: Express.Multer.File,
  ) {
    const existExam = await this.prisma.exam.findUnique({
      where: { id: payload.examId },
      select: { id: true, groupId: true, startAt: true, endAt: true },
    });

    if (!existExam) {
      throw new NotFoundException('Exam not found');
    }

    await this.assertGroupAccess(existExam.groupId, currentUser);
    this.assertSubmissionWindow(existExam);

    if (!payload.comment && !file) {
      throw new BadRequestException('Izoh yoki fayl kiritish kerak');
    }

    const existingResponse = await this.prisma.examResponse.findFirst({
      where: { examId: payload.examId, studentId: currentUser.id },
      select: { id: true },
    });

    if (existingResponse) {
      throw new BadRequestException(
        'Exam allaqachon yuborilgan. Uni tahrirlashingiz mumkin',
      );
    }

    let fileUrl: string | undefined;
    if (file) {
      fileUrl = await this.cloudinary.uploadFile(
        file,
        'exams/responses',
        DOCUMENT_MIME_TYPES,
      );
    }

    const response = await this.prisma.examResponse.create({
      data: {
        examId: payload.examId,
        studentId: currentUser.id,
        title: payload.title,
        comment: payload.comment,
        file: fileUrl,
      },
      select: responseSelect,
    });

    return {
      success: true,
      message: 'Exam response created successfully',
      data: response,
    };
  }

  async updateResponse(
    payload: ExamResponseDto,
    currentUser: CurrentUser,
    file?: Express.Multer.File,
  ) {
    const existExam = await this.prisma.exam.findUnique({
      where: { id: payload.examId },
      select: { id: true, groupId: true, startAt: true, endAt: true },
    });

    if (!existExam) {
      throw new NotFoundException('Exam not found');
    }

    await this.assertGroupAccess(existExam.groupId, currentUser);
    this.assertSubmissionWindow(existExam);

    const existResponse = await this.prisma.examResponse.findFirst({
      where: { examId: payload.examId, studentId: currentUser.id },
      orderBy: { id: 'desc' },
      select: { id: true },
    });

    if (!existResponse) {
      throw new NotFoundException('Exam response not found');
    }

    let fileUrl: string | undefined;
    if (file) {
      fileUrl = await this.cloudinary.uploadFile(
        file,
        'exams/responses',
        DOCUMENT_MIME_TYPES,
      );
    }

    const response = await this.prisma.examResponse.update({
      where: { id: existResponse.id },
      data: {
        title: payload.title,
        comment: payload.comment,
        file: fileUrl ?? undefined,
      },
      select: responseSelect,
    });

    return {
      success: true,
      message: 'Exam response updated successfully',
      data: response,
    };
  }
}
