import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Status } from '@prisma/client';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { PaginationQueryDto } from 'src/common/dto/pagination.dto';
import {
  buildPaginatedResult,
  resolvePagination,
} from 'src/common/utils/pagination.util';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import {
  orgFilter,
  resolveOwnerOrganizationId,
} from 'src/common/utils/org-scope.util';

@Injectable()
export class CourseService {
  constructor(private prisma: PrismaService) {}

  async getAllCourse(user: RequestUser, query?: PaginationQueryDto) {
    const { take, skip } = resolvePagination(query);
    // Har bir tashkilot faqat o'z kurslarini ko'radi.
    const where = { status: Status.ACTIVE, ...orgFilter(user) };

    const [courses, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        where,
        orderBy: { id: 'desc' },
        take,
        skip,
      }),
      this.prisma.course.count({ where }),
    ]);

    return buildPaginatedResult(courses, total, query, 'course/all');
  }

  async createCourse(user: RequestUser, payload: CreateCourseDto) {
    const organizationId = resolveOwnerOrganizationId(user);

    // Nom faqat shu tashkilot ichida takrorlanmasligi kerak.
    const existCourse = await this.prisma.course.findFirst({
      where: { name: payload.name, organizationId },
    });
    if (existCourse) {
      throw new ConflictException('Course name alread exist');
    }

    await this.prisma.course.create({
      data: { ...payload, organizationId },
    });

    return {
      success: true,
      message: 'Course created',
    };
  }

  async getOneCourse(user: RequestUser, id: number) {
    const course = await this.prisma.course.findFirst({
      where: { id, status: Status.ACTIVE, ...orgFilter(user) },
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    return {
      success: true,
      data: course,
    };
  }

  async updateCourseById(
    user: RequestUser,
    id: number,
    payload: UpdateCourseDto,
  ) {
    await this.ensureOwned(user, id);

    const course = await this.prisma.course.update({
      where: { id },
      data: payload,
    });
    return {
      success: true,
      data: course,
    };
  }

  async deleteCourseById(user: RequestUser, id: number) {
    const existingCourse = await this.ensureOwned(user, id);

    if (existingCourse.status === Status.INACTIVE) {
      throw new NotFoundException('Course not found');
    }

    await this.prisma.$transaction([
      this.prisma.group.updateMany({
        where: { courseId: id, status: Status.ACTIVE },
        data: { status: Status.INACTIVE },
      }),
      this.prisma.course.update({
        where: { id },
        data: { status: Status.INACTIVE },
      }),
    ]);

    return {
      success: true,
      message: 'Course deleted',
    };
  }

  /**
   * Kurs shu tashkilotnikimi. Boshqa tashkilotniki bo'lsa ham "topilmadi"
   * deyiladi — boshqa tashkilotda bu id borligi oshkor bo'lmasin.
   */
  private async ensureOwned(user: RequestUser, id: number) {
    const course = await this.prisma.course.findFirst({
      where: { id, ...orgFilter(user) },
      select: { id: true, status: true },
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    return course;
  }
}
