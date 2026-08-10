import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { CreateLessonVideosDto } from './dto/create.lesson-videos.dto';
import { Role } from '@prisma/client';
import { CloudinaryService } from 'src/common/cloudinary/cloudinary.service';
import { OrgAccessService } from 'src/common/utils/org-access.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';

@Injectable()
export class LessonVideosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly orgAccess: OrgAccessService,
  ) {}

  async getAllLessonVideosByGroup(groupId: number, currentUser: RequestUser) {
    await this.orgAccess.assertGroupAccess(currentUser, groupId);

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

    /*
      Ilgari bu yerda hech qanday tekshiruv yo'q edi: `groupId` va `lessonId`
      so'rovdan to'g'ridan-to'g'ri bazaga tushardi, ya'ni istalgan o'qituvchi
      begona (hatto boshqa tashkilotdagi) guruhga video ilova qila olardi.
    */
    await this.orgAccess.assertGroupAccess(currentUser, payload.groupId, {
      requireActive: true,
    });

    const lesson = await this.prisma.lesson.findUnique({
      where: { id: payload.lessonId },
      select: { groupId: true },
    });

    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }

    if (lesson.groupId !== payload.groupId) {
      throw new BadRequestException('Bu dars shu guruhga tegishli emas');
    }

    await this.prisma.lessonVideo.create({
      data: {
        ...payload,
        file: filename,
        /*
          `teacherId` Teacher jadvaliga, `userId` esa User jadvaliga FK.
          Ilgari ikkalasiga ham bir xil `currentUser.id` yozilardi: jadvallar
          ID hisoblagichi alohida bo'lgani uchun bu yozuvni butunlay boshqa
          odamlarga bog'lab qo'yardi (yoki FK xatosi bilan yiqilardi).
        */
        teacherId: currentUser.role === Role.TEACHER ? currentUser.id : null,
        userId: currentUser.role === Role.TEACHER ? null : currentUser.id,
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
      select: { id: true, file: true, groupId: true },
    });

    if (!existing) {
      throw new NotFoundException('Lesson video not found');
    }

    // Ilgari faqat o'qituvchi tekshirilardi — boshqa tashkilotning admini
    // begona `id` ni yuborib videoni o'chira olardi.
    await this.orgAccess.assertGroupAccess(currentUser, existing.groupId);

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
