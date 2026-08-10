import {
  BadRequestException,
  Body,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Status } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { CreateStudentGroupDto } from './dto/create.student-group.dto';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import { orgFilter } from 'src/common/utils/org-scope.util';
import { OrgAccessService } from 'src/common/utils/org-access.service';

@Injectable()
export class StudentGroupService {
  constructor(
    private prisma: PrismaService,
    private orgAccess: OrgAccessService,
  ) {}

  async createStudentGroup(
    payload: CreateStudentGroupDto,
    currentUser: RequestUser,
  ) {
    const groupStudentsCount = await this.prisma.studentGroup.count({
      where: {
        groupId: payload.groupId,
      },
    });
    const existGroup = await this.prisma.group.findFirst({
      where: {
        id: payload.groupId,
        status: Status.ACTIVE,
        ...orgFilter(currentUser),
      },
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

    /*
      O'quvchi ham so'rov egasining tashkilotidan bo'lishi shart. Ilgari
      tekshiruv yo'q edi: begona `studentId` yuborib, boshqa markazning
      o'quvchisini o'z guruhiga qo'shib olish mumkin edi.
    */
    const existStudent = await this.prisma.student.findFirst({
      where: {
        id: payload.studentId,
        status: Status.ACTIVE,
        ...orgFilter(currentUser),
      },
    });

    if (!existStudent) {
      throw new NotFoundException('Student not found with this id');
    }
    if (groupStudentsCount >= existGroup.room.capacity) {
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
    currentUser: RequestUser,
  ) {
    /*
      Guruh so'rov egasiga tegishlimi — bu tekshiruv umuman yo'q edi: begona
      `groupId` va `studentId` yuborib, boshqa markazning o'quvchisini
      guruhidan chiqarib tashlash mumkin edi.
    */
    // `requireActive` qo'yilmaydi: muzlatilgan guruhdan ham o'quvchini
    // chiqarish kerak bo'lishi mumkin.
    await this.orgAccess.assertGroupAccess(currentUser, payload.groupId);

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
