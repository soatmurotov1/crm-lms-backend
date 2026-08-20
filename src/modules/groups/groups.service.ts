import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, Status, UserStatus } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import {
  orgFilter,
  resolveOwnerOrganizationId,
} from 'src/common/utils/org-scope.util';
import { OrgAccessService } from 'src/common/utils/org-access.service';

@Injectable()
export class GroupsService {
  constructor(
    private prisma: PrismaService,
    private orgAccess: OrgAccessService,
  ) {}

  private resolveStatusFilter(statusFilter?: string): Status[] {
    const normalized = String(statusFilter || 'ACTIVE')
      .trim()
      .toUpperCase();

    if (normalized === 'ALL') {
      return [Status.ACTIVE, Status.FREEZE, Status.INACTIVE];
    }

    if (normalized === 'FREEZE' || normalized === 'FROZEN') {
      return [Status.FREEZE];
    }

    if (normalized === 'INACTIVE' || normalized === 'ARCHIVE') {
      return [Status.INACTIVE];
    }

    return [Status.ACTIVE];
  }

  async getAllStudentGroupById(groupId: number, currentUser: RequestUser) {
    /*
      Guruh so'rov egasiga tegishlimi. Tashkilot tekshiruvi bor edi, lekin
      undan keyingi savol qolib ketgandi: tashkilot ichidagi har qanday
      o'qituvchi (va har qanday o'quvchi) begona guruhning ro'yxatini
      ochib ko'ra olardi.
    */
    await this.orgAccess.assertGroupAccess(currentUser, groupId);

    const groups = await this.prisma.studentGroup.findMany({
      where: {
        groupId,
        status: Status.ACTIVE,
        student: {
          status: UserStatus.ACTIVE,
        },
      },
      select: {
        id: true,
        student: {
          select: {
            id: true,
            fullName: true,
            photo: true,
            phone: true,
          },
        },
      },
    });

    const formattedGroups = groups.map((group) => group.student);

    return {
      success: true,
      data: formattedGroups,
    };
  }

  async getGroupLessons(groupId: number, currentUser: RequestUser) {
    await this.orgAccess.assertGroupAccess(currentUser, groupId);

    const lessons = await this.prisma.lesson.findMany({
      where: {
        groupId,
      },
    });

    return {
      success: true,
      data: lessons,
    };
  }

  async getAllGroup(currentUser: RequestUser, statusFilter?: string) {
    // Guruh qaysi tashkilotniki — barcha rollar uchun shu filtr qo'llanadi.
    const orgWhere = orgFilter(currentUser);

    if (currentUser?.role === Role.STUDENT) {
      const studentGroups = await this.prisma.studentGroup.findMany({
        where: {
          studentId: currentUser.id,
          group: orgWhere,
        },
        include: {
          group: {
            include: {
              course: {
                select: {
                  id: true,
                  name: true,
                  durationLesson: true,
                },
              },
              teacher: {
                select: {
                  id: true,
                  fullName: true,
                },
              },
              user: {
                select: {
                  id: true,
                  fullName: true,
                },
              },
            },
          },
        },
      });

      return {
        success: true,
        data: studentGroups.map((item) => item.group),
      };
    }

    const statuses = this.resolveStatusFilter(statusFilter);

    const whereClause =
      currentUser?.role === Role.TEACHER
        ? { status: { in: statuses }, teacherId: currentUser.id, ...orgWhere }
        : { status: { in: statuses }, ...orgWhere };

    const groups = await this.prisma.group.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
          },
        },
        course: {
          select: {
            id: true,
            name: true,
            durationLesson: true,
          },
        },
        room: {
          select: {
            id: true,
            name: true,
          },
        },
        teacher: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    });

    return {
      success: true,
      data: groups,
    };
  }

  async createGroup(payload: CreateGroupDto, currentUser: RequestUser) {
    const organizationId = resolveOwnerOrganizationId(currentUser);
    // O'qituvchi, kurs va xona ham shu tashkilotniki bo'lishi shart —
    // aks holda boshqa tashkilotning resursi guruhga biriktirilib qolardi.
    const orgWhere = orgFilter(currentUser);

    const existTeacher = await this.prisma.teacher.findFirst({
      where: {
        id: payload.teacherId,
        status: Status.ACTIVE,
        ...orgWhere,
      },
    });

    if (!existTeacher) {
      throw new NotFoundException('Teacher not found with this id');
    }

    const existCourse = await this.prisma.course.findFirst({
      where: {
        id: payload.courseId,
        status: Status.ACTIVE,
        ...orgWhere,
      },
      select: {
        durationLesson: true,
      },
    });

    if (!existCourse) {
      throw new NotFoundException('Course not found with this id');
    }

    const existRoom = await this.prisma.room.findFirst({
      where: {
        id: payload.roomId,
        status: Status.ACTIVE,
        ...orgWhere,
      },
    });

    if (!existRoom) {
      throw new NotFoundException('Room not found with this id');
    }

    const existGroup = await this.prisma.group.findFirst({
      where: {
        name: payload.name,
        courseId: payload.courseId,
      },
    });
    if (existGroup) {
      throw new ConflictException('Group already exist with this course');
    }

    function timeToMinutes(time: string): number {
      const [hour, minute] = time.split(':').map(Number);
      return hour * 60 + minute;
    }

    const roomGroups = await this.prisma.group.findMany({
      where: {
        roomId: payload.roomId,
        status: Status.ACTIVE,
      },
      select: {
        startTime: true,
        weekDays: true,
        course: {
          select: {
            durationLesson: true,
          },
        },
      },
    });

    const newStartMinute = timeToMinutes(payload.startTime);
    const newEndMinute = newStartMinute + existCourse.durationLesson;

    const hasRoomConflict = roomGroups.some((roomGroup) => {
      const roomGroupDays = Array.isArray(roomGroup.weekDays)
        ? roomGroup.weekDays
        : [];
      const hasSameDay = roomGroupDays.some((day) =>
        payload.weekDays.includes(day),
      );

      if (!hasSameDay) {
        return false;
      }

      const startMinute = timeToMinutes(roomGroup.startTime);
      const endMinute = startMinute + roomGroup.course.durationLesson;

      return startMinute < newEndMinute && endMinute > newStartMinute;
    });

    if (hasRoomConflict) {
      throw new BadRequestException('Bu vaqtda xona band');
    }

    await this.prisma.group.create({
      data: {
        ...payload,
        userId: currentUser.id,
        startDate: new Date(payload.startDate),
        organizationId,
      },
    });

    return {
      success: true,
      message: 'Group created',
    };
  }

  async updateGroupById(
    groupId: number,
    payload: UpdateGroupDto,
    currentUser: RequestUser,
  ) {
    await this.orgAccess.assertGroupAccess(currentUser, groupId);

    /*
      Faqat kelgan maydonlar yangilanadi. Tip `any` emas, `Prisma`
      niki: aks holda bu yerda yozilgan har bir maydon nomi va qiymati
      tekshiruvsiz o'tib ketadi va sxemada yo'q maydonni yozib yuborish
      faqat ish vaqtida bilinadi.
    */
    // `Unchecked` variant — bog'lanishlar `teacher: { connect: ... }`
    // ko'rinishida emas, to'g'ridan-to'g'ri `teacherId` bilan beriladi.
    const data: Prisma.GroupUncheckedUpdateInput = {};

    if (payload.teacherId !== undefined)
      data.teacherId = Number(payload.teacherId);
    if (payload.roomId !== undefined) data.roomId = Number(payload.roomId);
    if (payload.courseId !== undefined)
      data.courseId = Number(payload.courseId);
    if (payload.name !== undefined && payload.name.trim() !== '')
      data.name = payload.name.trim();
    if (payload.startDate !== undefined && payload.startDate !== '')
      data.startDate = new Date(payload.startDate);
    if (payload.startTime !== undefined && payload.startTime.trim() !== '')
      data.startTime = payload.startTime.trim();
    if (payload.status !== undefined) data.status = payload.status;
    if (payload.weekDays !== undefined) data.weekDays = payload.weekDays;

    if (Object.keys(data).length === 0) {
      return {
        success: true,
        message: 'No changes provided',
      };
    }

    await this.prisma.group.update({
      where: {
        id: groupId,
      },
      data,
    });
    return {
      success: true,
      message: 'Group updated',
    };
  }

  async deleteGroupById(groupId: number, currentUser: RequestUser) {
    const existGroup = await this.prisma.group.findFirst({
      where: {
        id: groupId,
        status: Status.ACTIVE,
        ...orgFilter(currentUser),
      },
    });
    if (!existGroup) {
      throw new NotFoundException('Group not found');
    }
    await this.prisma.group.update({
      where: {
        id: groupId,
      },
      data: {
        status: Status.FREEZE,
      },
    });

    return {
      success: true,
      message: 'Group deleted',
    };
  }
}
