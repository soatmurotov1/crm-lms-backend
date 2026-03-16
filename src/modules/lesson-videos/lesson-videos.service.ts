import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { CreateLessonVideosDto } from './dto/create.lesson-videos.dto';
import { Role } from '@prisma/client';

@Injectable()
export class LessonVideosService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllLessonVideosByGroup( groupId: number, currentUser: { id: number; role: Role }) {
    const existGroup = await this.prisma.group.findUnique({
      where: {
        id: groupId,
        status: 'ACTIVE'
      }
    })

    if (!existGroup) {
      throw new NotFoundException('Group not found');
    }

    if (currentUser.role === Role.TEACHER && existGroup.teacherId !== currentUser.id) {
      throw new ForbiddenException('Bu sening guruhing emas');
    }

    const lessonVideos = await this.prisma.lessonVideo.findMany({
        where: {
            groupId
        },
        select: {
            id: true,
            file: true,
            lessonId: true,
            lesson: {
                select: {
                    title: true
                }
            }
        } 

    })
    return {
      success: true,
      data: lessonVideos
      
    }
  }

  async createLessonVideo(
    payload: CreateLessonVideosDto,
    currentUser: { id: number; role: Role },
    filename?: string
  ) {
    if (!filename) {
      throw new BadRequestException('File is required')
    }

    await this.prisma.lessonVideo.create({
      data: {
        ...payload,
        file: filename,
        teacherId: currentUser.id,
        userId: currentUser.id
    }
    })

    return {
      success: true,
      message: 'Lesson video created successfully'
    }
  }
}
