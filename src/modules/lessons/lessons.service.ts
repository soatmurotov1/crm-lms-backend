import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { Role, Status } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { UpdateLessonDto } from './dto/update-lesson.dto';

@Injectable()
export class LessonsService {
  constructor(private prisma: PrismaService) {}

  async getOneLessonByGroupIdAndLessonId(
    groupId: number,
    lessonId: number,
    currentUser: { id: number; role: Role },
  ) {
    const existGroup = await this.prisma.group.findFirst({
      where: {
        id: groupId,
        status: Status.ACTIVE,
        teacherId:
          currentUser.role === Role.TEACHER ? currentUser.id : undefined,
      },
    });

    if (!existGroup) {
      throw new NotFoundException('Group not found with this id');
    }

    const lesson = await this.prisma.lesson.findFirst({
      where: {
        id: lessonId,
        groupId,
      },
      select: {
        id: true,
        title: true,
        groupId: true,
        teacherId: true,
        userId: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!lesson) {
      throw new NotFoundException('Lesson not found with this id');
    }

    return {
      success: true,
      data: lesson,
    };
  }

  async getLessonsByGroupId(
    groupId: number,
    currentUser: { id: number; role: Role },
  ) {
    const existGroup = await this.prisma.group.findFirst({
      where: {
        id: groupId,
        status: Status.ACTIVE,
        teacherId:
          currentUser.role === Role.TEACHER ? currentUser.id : undefined,
      },
    });

    if (!existGroup) {
      throw new NotFoundException('Group not found with this id');
    }

    const lessons = await this.prisma.lesson.findMany({
      where: {
        groupId,
      },
      select: {
        id: true,
        title: true,
      },
    });
    return {
      success: true,
      data: lessons,
    };
  }

  async createLesson(
    payload: CreateLessonDto,
    currentUser: { id: number; role: Role },
  ) {
    const existGroup = await this.prisma.group.findFirst({
      where: { id: payload.groupId, status: Status.ACTIVE },
    });

    if (!existGroup) {
      throw new NotFoundException('Group not found with this id');
    }

    await this.prisma.lesson.create({
      data: {
        ...payload,
        teacherId: currentUser.role == Role.TEACHER ? currentUser.id : null,
        userId: currentUser.role != Role.TEACHER ? currentUser.id : null,
      },
    });
    return {
      success: true,
      message: 'Lesson created successfully',
    };
  }

  async updateLessonById(
    groupId: number,
    lessonId: number,
    payload: UpdateLessonDto,
  ) {
    const existGroup = await this.prisma.group.findFirst({
      where: { id: groupId, status: Status.ACTIVE },
    });

    if (!existGroup) {
      throw new NotFoundException('Group not found with this id');
    }
    const lesson = await this.prisma.lesson.findFirst({
      where: {
        id: lessonId,
        groupId,
      },
    });
    if (!lesson) {
      throw new NotFoundException('Lesson not found with this id');
    }

    const updatedLesson = await this.prisma.lesson.update({
      where: { id: lessonId },
      data: payload,
    });

    return {
      success: true,
      message: 'Lesson updated successfully',
      data: updatedLesson,
    };
  }

  async deleteLessonById(
    groupId: number,
    lessonId: number,
    currentUser: { id: number },
  ) {
    const existGroup = await this.prisma.group.findFirst({
      where: { id: groupId, status: Status.ACTIVE },
    });

    if (!existGroup) {
      throw new NotFoundException('Group not found with this id');
    }

    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, groupId },
    });

    if (!lesson) {
      throw new NotFoundException('Lesson not found with this id');
    }

    await this.prisma.lesson.delete({
      where: { id: lessonId },
    });

    return {
      success: true,
      message: 'Lesson deleted successfully',
    };
  }
}
