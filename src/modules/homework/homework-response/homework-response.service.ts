import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CloudinaryService } from 'src/common/cloudinary/cloudinary.service';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { CreateHomeworkResponseDto } from './dto/create.response.dto';

@Injectable()
export class HomeworkResponseService {
  private readonly editWindowMs = 60 * 60 * 1000;
  private readonly submitWindowMs = 24 * 60 * 60 * 1000;

  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
  ) {}

  async getMyHomeworkResponse(homeworkId: number, currentUser: { id: number }) {
    const existHomework = await this.prisma.homework.findUnique({
      where: {
        id: homeworkId,
      },
    });

    if (!existHomework) {
      throw new NotFoundException('Homework not found');
    }

    const createdAt = new Date(existHomework.created_at).getTime();
    if (Date.now() - createdAt > this.submitWindowMs) {
      throw new BadRequestException(
        'Uyga vazifa muddati tugagan (24 soat ichida topshirish mumkin)',
      );
    }

    const response = await this.prisma.homeworkResponse.findFirst({
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
        file: true,
        created_at: true,
        updated_at: true,
      },
    });

    return {
      success: true,
      data: response,
    };
  }

  async getStudentHomeworkResponse(
    homeworkId: number,
    studentId: number,
    currentUser: { id: number; role: Role },
  ) {
    const existHomework = await this.prisma.homework.findUnique({
      where: {
        id: homeworkId,
      },
      select: {
        id: true,
        teacherId: true,
        groupId: true,
      },
    });

    if (!existHomework) {
      throw new NotFoundException('Homework not found');
    }

    if (
      currentUser.role === Role.TEACHER &&
      existHomework.teacherId !== currentUser.id
    ) {
      const homeworkGroup = await this.prisma.group.findUnique({
        where: {
          id: existHomework.groupId,
        },
        select: {
          teacherId: true,
        },
      });

      if (!homeworkGroup || homeworkGroup.teacherId !== currentUser.id) {
        throw new ForbiddenException('Bu sening homeworking emas');
      }
    }

    const response = await this.prisma.homeworkResponse.findFirst({
      where: {
        homeworkId,
        studentId,
      },
      orderBy: {
        id: 'desc',
      },
      select: {
        id: true,
        title: true,
        file: true,
        created_at: true,
        updated_at: true,
        student: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    if (!response) {
      throw new NotFoundException('Homework response not found');
    }

    return {
      success: true,
      data: response,
    };
  }

  async createHomeworkResponse(
    payload: CreateHomeworkResponseDto,
    currentUser: { id: number },
    file?: Express.Multer.File,
  ) {
    const existHomework = await this.prisma.homework.findUnique({
      where: {
        id: payload.homeworkId,
      },
    });

    if (!existHomework) {
      throw new NotFoundException('Homework not found');
    }

    const existingResponse = await this.prisma.homeworkResponse.findFirst({
      where: {
        homeworkId: payload.homeworkId,
        studentId: currentUser.id,
      },
      orderBy: {
        id: 'desc',
      },
      select: {
        id: true,
        created_at: true,
      },
    });

    if (existingResponse) {
      throw new BadRequestException(
        'Uyga vazifa allaqachon yuborilgan. Faqat 1 soat ichida tahrirlash mumkin',
      );
    }

    let fileUrl: string | undefined;
    if (file) {
      fileUrl = await this.cloudinary.uploadFile(file, 'homework/responses');
    }

    await this.prisma.homeworkResponse.create({
      data: {
        title: payload.title,
        file: fileUrl,
        homeworkId: payload.homeworkId,
        studentId: currentUser.id,
      },
    });

    return {
      success: true,
      message: 'Homework response created successfully',
    };
  }

  async updateHomeworkResponse(
    payload: CreateHomeworkResponseDto,
    currentUser: { id: number },
    file?: Express.Multer.File,
  ) {
    const existHomework = await this.prisma.homework.findUnique({
      where: {
        id: payload.homeworkId,
      },
    });

    if (!existHomework) {
      throw new NotFoundException('Homework not found');
    }

    const existHomeworkResponse = await this.prisma.homeworkResponse.findFirst({
      where: {
        homeworkId: payload.homeworkId,
        studentId: currentUser.id,
      },
      orderBy: {
        id: 'desc',
      },
    });

    if (!existHomeworkResponse) {
      throw new NotFoundException('Homework response not found');
    }

    const createdAt = new Date(existHomeworkResponse.created_at).getTime();
    if (Date.now() - createdAt > this.editWindowMs) {
      throw new BadRequestException(
        'Uyga vazifani tahrirlash vaqti tugagan (1 soat ichida tahrirlash mumkin)',
      );
    }

    let fileUrl: string | undefined;
    if (file) {
      fileUrl = await this.cloudinary.uploadFile(file, 'homework/responses');
    }

    await this.prisma.homeworkResponse.update({
      where: {
        id: existHomeworkResponse.id,
      },
      data: {
        title: payload.title,
        file: fileUrl ?? undefined,
      },
    });

    return {
      success: true,
      message: 'Homework response updated successfully',
    };
  }
}
