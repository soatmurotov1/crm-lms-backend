import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { CloudinaryService } from 'src/common/cloudinary/cloudinary.service';
import { CreateTeacherDto } from './dto/create.teachers.dto';
import { comparePassword, hashPassword } from 'src/common/bcrypt/bcrypt';
import { UpdateTeachersDto } from './dto/update.teachers.dto';
import { UserStatus } from '@prisma/client';
import { ChangeTeacherPasswordDto } from './dto/change-teacher-password.dto';
import { normalizePhone } from 'src/common/utils/phone.util';
import { PaginationQueryDto } from 'src/common/dto/pagination.dto';
import {
  buildPaginatedResult,
  resolvePagination,
} from 'src/common/utils/pagination.util';
import { VerificationService } from 'src/modules/auth/verification.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import {
  orgFilter,
  resolveOwnerOrganizationId,
} from 'src/common/utils/org-scope.util';

@Injectable()
export class TeachersService {
  constructor(
    private prisma: PrismaService,
    private cloudinaryService: CloudinaryService,
    private verificationService: VerificationService,
  ) {}

  async createTeacher(
    user: RequestUser,
    payload: CreateTeacherDto,
    file?: Express.Multer.File,
  ) {
    const organizationId = resolveOwnerOrganizationId(user);
    let photoUrl: string | null = null;
    const normalizedPhone = normalizePhone(payload.phone);
    const plainPassword = payload.password.trim();

    await this.ensurePhoneIsFree(normalizedPhone);

    if (file) {
      photoUrl = await this.cloudinaryService.uploadFile(file, 'teachers');
    }

    await this.prisma.teacher.create({
      data: {
        ...payload,
        phone: normalizedPhone,
        experience: Number(payload.experience),
        password: await hashPassword(plainPassword),
        photo: photoUrl,
        organizationId,
      },
    });

    // SMS ketmasa ham o'qituvchi yaratilgan bo'ladi.
    const smsSent =
      await this.verificationService.sendCodeQuietly(normalizedPhone);

    return {
      success: true,
      smsSent,
      message: smsSent
        ? 'Teacher successfully created'
        : "O'qituvchi yaratildi, lekin SMS yuborilmadi",
    };
  }

  private async ensurePhoneIsFree(phone: string, excludeId?: number) {
    const existing = await this.prisma.teacher.findFirst({
      where: {
        phone,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(
        "Bu telefon raqami allaqachon ro'yxatdan o'tgan. Boshqa raqam kiriting",
      );
    }
  }

  async getAllTeachers(user: RequestUser, query?: PaginationQueryDto) {
    const { take, skip } = resolvePagination(query);
    // Har bir tashkilot faqat o'z o'qituvchilarini ko'radi.
    const where = orgFilter(user);

    const [teachers, total] = await this.prisma.$transaction([
      this.prisma.teacher.findMany({
        where,
        omit: { password: true },
        orderBy: { id: 'desc' },
        take,
        skip,
      }),
      this.prisma.teacher.count({ where }),
    ]);

    return buildPaginatedResult(teachers, total, query, 'teachers/all');
  }

  async getOneTeacher(user: RequestUser, id: number) {
    const Teacher = await this.prisma.teacher.findFirst({
      where: { id, ...orgFilter(user) },
      omit: { password: true },
    });
    if (!Teacher) {
      throw new NotFoundException('Teacher is Not found');
    }

    return {
      success: true,
      data: Teacher,
    };
  }

  async getMyProfile(currentUser: { id: number }) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { id: currentUser.id },
      select: {
        id: true,
        fullName: true,
        phone: true,
        photo: true,
        position: true,
        experience: true,
        status: true,
        created_at: true,
      },
    });

    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }

    return {
      success: true,
      data: teacher,
    };
  }

  async updateTeacherById(
    user: RequestUser,
    id: number,
    payload: UpdateTeachersDto,
    file?: Express.Multer.File,
  ) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { id, ...orgFilter(user) },
    });
    if (!teacher) {
      throw new NotFoundException(`Not found teacherId ${id}`);
    }
    let photoUrl: string | null = teacher.photo;
    let normalizedPhone: string | undefined;

    if (payload.phone && payload.phone.trim() !== '') {
      normalizedPhone = normalizePhone(payload.phone);
      if (normalizedPhone !== teacher.phone) {
        await this.ensurePhoneIsFree(normalizedPhone, id);
      }
    }

    if (file) {
      photoUrl = await this.cloudinaryService.uploadFile(file, 'teachers');
    }
    await this.prisma.teacher.update({
      where: { id },
      data: {
        ...payload,
        phone: normalizedPhone,
        experience: payload.experience ? Number(payload.experience) : undefined,
        photo: photoUrl,
      },
    });
    return {
      success: true,
      message: 'Teacher updated successfully',
    };
  }

  /**
   * O'qituvchini butunlay o'chiradi.
   *
   * `Group.teacherId` majburiy maydon, ya'ni bazada `Restrict` — guruhi bor
   * o'qituvchini o'chirishga urinish foreign key xatosi bilan 500 qaytarardi
   * va foydalanuvchi sababini bilmasdi. Endi to'sqinlik aniq aytiladi.
   *
   * `Rating` esa shunchaki dars bahosi — o'qituvchi bilan birga o'chadi.
   * Qolgan bog'lanishlar (dars, davomat, baho...) `teacherId` ni ixtiyoriy
   * qilgani uchun avtomatik `NULL` ga o'tadi va tarix saqlanib qoladi.
   */
  async deleteTeacher(user: RequestUser, id: number) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { id, ...orgFilter(user) },
      select: { id: true, fullName: true },
    });

    if (!teacher) {
      throw new NotFoundException(`Not found teacherId ${id}`);
    }

    const groups = await this.prisma.group.findMany({
      where: { teacherId: id },
      select: { name: true },
    });

    if (groups.length > 0) {
      const names = groups.map((group) => group.name).join(', ');
      throw new ConflictException(
        `O'qituvchini o'chirib bo'lmadi: unga ${groups.length} ta guruh biriktirilgan (${names}). ` +
          "Avval guruhlarni boshqa o'qituvchiga o'tkazing yoki guruhlarni o'chiring",
      );
    }

    await this.prisma.$transaction([
      this.prisma.rating.deleteMany({ where: { teacherId: id } }),
      this.prisma.teacher.delete({ where: { id } }),
    ]);

    return {
      success: true,
      message: "O'qituvchi o'chirildi",
      id,
    };
  }

  async toggleArchiveTeacher(user: RequestUser, id: number) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { id, ...orgFilter(user) },
      select: { id: true, status: true },
    });

    if (!teacher) {
      throw new NotFoundException(`Not found teacherId ${id}`);
    }

    const nextStatus =
      teacher.status === UserStatus.ACTIVE
        ? UserStatus.INACTIVE
        : UserStatus.ACTIVE;

    const updatedTeacher = await this.prisma.teacher.update({
      where: { id },
      data: { status: nextStatus },
    });

    return {
      success: true,
      message:
        nextStatus === UserStatus.INACTIVE
          ? 'Teacher archived successfully'
          : 'Teacher unarchived successfully',
      data: updatedTeacher,
    };
  }

  async changeMyPassword(
    currentUser: { id: number },
    payload: ChangeTeacherPasswordDto,
  ) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { id: currentUser.id },
    });

    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }

    const oldPasswordValid = await comparePassword(
      payload.oldPassword,
      teacher.password,
    );

    if (!oldPasswordValid) {
      throw new BadRequestException("Amaldagi parol noto'g'ri");
    }

    if (payload.oldPassword === payload.newPassword) {
      throw new BadRequestException(
        "Amaldagi va yangi parol bir xil bo'lmasligi kerak",
      );
    }

    await this.prisma.teacher.update({
      where: { id: teacher.id },
      data: {
        password: await hashPassword(payload.newPassword),
      },
    });

    return {
      success: true,
      message: 'Parol muvaffaqiyatli yangilandi',
    };
  }
}
