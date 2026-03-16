import { ConflictException, Injectable } from '@nestjs/common';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { PrismaService } from 'src/common/prisma/prisma.service';
@Injectable()
export class CourseService {
  constructor(private prisma: PrismaService) {}

  async getAllCourse() {
    const courses = await this.prisma.course.findMany({
      where: { status: 'ACTIVE' },
    });

    return {
      success: true,
      data: courses,
    };
  }

  async createCourse(payload: CreateCourseDto) {
    const existCourse = await this.prisma.course.findUnique({
      where: { name: payload.name },
    });
    if (existCourse) {
      throw new ConflictException('Course name alread exist');
    }

    await this.prisma.course.create({
      data: payload,
    });

    return {
      success: true,
      message: 'Course created',
    };
  }

  async getOneCourse(id: number) {
    const course = await this.prisma.course.findFirst({
      where: { id, status: 'ACTIVE' },
    });
    return {
      success: true,
      data: course,
    };
  }

  async updateCourseById(id: number, payload: UpdateCourseDto) {
    const course = await this.prisma.course.update({
      where: { id },
      data: payload,
    });
    return {
      success: true,
      data: course,
    };
  }

  async deleteCourseById(id: number) {
    await this.prisma.course.update({
      where: { id },
      data: { status: 'INACTIVE' },
    });
    return {
      success: true,
      message: 'Course deleted',
    };
  }
}
