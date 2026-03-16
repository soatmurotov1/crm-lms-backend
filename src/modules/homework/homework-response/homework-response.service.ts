import { Injectable, NotFoundException } from '@nestjs/common';
import { CloudinaryService } from 'src/common/cloudinary/cloudinary.service';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { CreateHomeworkResponseDto } from './dto/create.response.dto';

@Injectable()
export class HomeworkResponseService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
  ) {}

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
