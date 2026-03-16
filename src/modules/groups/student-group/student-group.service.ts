import {
  BadRequestException,
  Body,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Status } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { CreateStudentGroupDto } from './dto/create.student-group.dto';

@Injectable()
export class StudentGroupService {
  constructor(private prisma: PrismaService) {}

  async createStudentGroup(
    payload: CreateStudentGroupDto,
    currentUser: { id: number },
  ) {
    const groupStudentsCount = await this.prisma.studentGroup.count({
      where: {
        groupId: payload.groupId,
      },
    });
    const existGroup = await this.prisma.group.findUnique({
      where: { id: payload.groupId, status: Status.ACTIVE },
      select: {
        room: {
          select: {
            capacity: true,
          },
        },
      },
    });

    if (!existGroup) {
      throw new NotFoundException('Group not found with this id');
    }

    const existStudent = await this.prisma.student.findUnique({
      where: { id: payload.studentId, status: Status.ACTIVE },
    });

    if (!existStudent) {
      throw new NotFoundException('Student not found with this id');
    }
    if (groupStudentsCount >= existGroup!.room.capacity) {
      throw new BadRequestException("Group limit to'lgan");
    }
    await this.prisma.studentGroup.create({
      data: {
        ...payload,
        userId: currentUser.id,
      },
    });

    return {
      success: true,
      message: 'Student added group',
    };
  }

  async deleteStudentGroup(
    payload: { id?: number; groupId: number; studentId: number },
    currentUser: { id: number },
  ) {
    const existStudentGroup = await this.prisma.studentGroup.findFirst({
      where: {
        id: payload.id,
        groupId: payload.groupId,
        studentId: payload.studentId,
      },
    });
    if (!existStudentGroup) {
      throw new NotFoundException('Student group not found with this id');
    }
    await this.prisma.studentGroup.delete({
      where: {
        id: existStudentGroup.id,
      },
    });
    return {
      success: true,
      message: 'Student deleted from group',
    };
  }
}
