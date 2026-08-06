import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { CreateLessonVideosDto } from './dto/create.lesson-videos.dto';
import { Role, Status } from '@prisma/client';
import { CloudinaryService } from 'src/common/cloudinary/cloudinary.service';
import { orgFilter } from 'src/common/utils/org-scope.util';
import type { RequestUser } from 'src/common/guard/current-user.decorator';

@Injectable()
export class LessonVideosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async getAllLessonVideosByGroup(
    groupId: number,
    currentUser: RequestUser,
  ) {
    const existGroup = await this.prisma.group.findFirst({
      where: {
        id: groupId,
        ...orgFilter(currentUser),
        status: 'ACTIVE',
      },
    });

    if (!existGroup) {
      throw new NotFoundException('Group not found');
    }

    if (
      currentUser.role === Role.TEACHER &&
      existGroup.teacherId !== currentUser.id
    ) {
      throw new ForbiddenException('Bu sening guruhing emas');
    }

    if (currentUser.role === Role.STUDENT) {
      const studentInGroup = await this.prisma.studentGroup.findFirst({
        where: {
          groupId,
          studentId: currentUser.id,
          status: Status.ACTIVE,
        },
      });

      if (!studentInGroup) {
        throw new ForbiddenException('Bu sening guruhing emas');
      }
    }

    const lessonVideos = await this.prisma.lessonVideo.findMany({
      where: {
        groupId,
      },
      select: {
        id: true,
        file: true,
        lessonId: true,
        created_at: true,
        lesson: {
          select: {
            title: true,
            created_at: true,
          },
        },
      },
    });
    return {
      success: true,
      data: lessonVideos,
    };
  }

  async createLessonVideo(
    payload: CreateLessonVideosDto,
    currentUser: RequestUser,
    filename?: string,
  ) {
    if (!filename) {
      throw new BadRequestException('File is required');
    }

    await this.prisma.lessonVideo.create({
      data: {
        ...payload,
        file: filename,
        teacherId: currentUser.id,
        userId: currentUser.id,
      },
    });

    return {
      success: true,
      message: 'Lesson video created successfully',
    };
  }

  async deleteLessonVideo(id: number, currentUser: RequestUser) {
    const existing = await this.prisma.lessonVideo.findUnique({
      where: { id },
      select: {
        id: true,
        file: true,
        lesson: {
          select: {
            group: {
              select: {
                teacherId: true,
              },
            },
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Lesson video not found');
    }

    if (
      currentUser.role === Role.TEACHER &&
      existing.lesson?.group?.teacherId !== currentUser.id
    ) {
      throw new ForbiddenException('Bu sening guruhing emas');
    }

    const publicId = this.extractCloudinaryPublicId(existing.file);
    if (publicId) {
      try {
        await this.cloudinaryService.deleteVideo(publicId);
      } catch {
        // Ignore cloud delete errors to keep database consistent.
      }
    }

    await this.prisma.lessonVideo.delete({ where: { id } });

    return {
      success: true,
      message: 'Lesson video deleted successfully',
    };
  }

  private extractCloudinaryPublicId(fileUrl: string) {
    if (!fileUrl) return null;
    const uploadIndex = fileUrl.indexOf('/upload/');
    if (uploadIndex === -1) return null;
    const pathPart = fileUrl.slice(uploadIndex + '/upload/'.length);
    const cleaned = pathPart.replace(/^v\d+\//, '');
    const withoutQuery = cleaned.split('?')[0];
    const withoutExt = withoutQuery.replace(/\.[^./]+$/, '');
    return withoutExt || null;
  }
}
