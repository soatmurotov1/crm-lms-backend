import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, Status } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';

@Injectable()
export class GroupsService {
  constructor(private prisma: PrismaService) {}

  async getAllStudentGroupById(groupId: number) {
    const groups = await this.prisma.studentGroup.findMany({
      where: {
        groupId,
        status: Status.ACTIVE,
      },
      select: {
        id: true,
        student: {
          select: {
            id: true,
            fullName: true,
            photo: true,
            email: true,
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

  async getGroupLessons(
    groupId: number,
    currentUser: { id: number; role: Role },
  ) {
    const existGroup = await this.prisma.group.findUnique({
      where: {
        id: groupId,
        status: 'ACTIVE',
      },
    });
    if (!existGroup) {
      throw new NotFoundException('Group not found');
    }

    if (
      currentUser.role == Role.TEACHER &&
      existGroup.teacherId != currentUser.id
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

  async getAllGroup(currentUser: { id: number; role: Role }) {
    if (currentUser?.role === Role.STUDENT) {
      const studentGroups = await this.prisma.studentGroup.findMany({
        where: {
          studentId: currentUser.id,
          status: Status.ACTIVE,
          group: {
            status: Status.ACTIVE,
          },
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

    const whereClause =
      currentUser?.role === Role.TEACHER
        ? { status: 'ACTIVE' as const, teacherId: currentUser.id }
        : { status: 'ACTIVE' as const };

    const groups = await this.prisma.group.findMany({
      where: whereClause,
      include: {
        user: {
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

  async createGroup(payload: CreateGroupDto, currentUser: { id: number }) {
    const existTeacher = await this.prisma.teacher.findFirst({
      where: {
        id: payload.teacherId,
        status: Status.ACTIVE,
      },
    });

    if (!existTeacher) {
      throw new NotFoundException('Teacher not found with this id');
    }

    const existCourse = await this.prisma.course.findFirst({
      where: {
        id: payload.courseId,
        status: Status.ACTIVE,
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
      },
    });

    if (!existRoom) {
      throw new NotFoundException('Room not found with this id');
    }

    const existGroup = await this.prisma.group.findUnique({
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
    currentUser: { id: number; role: Role },
  ) {
    const existGroup = await this.prisma.group.findUnique({
      where: {
        id: groupId,
        status: Status.ACTIVE,
      },
    });
    if (!existGroup) {
      throw new NotFoundException('Group not found');
    }

    if (
      currentUser.role === Role.TEACHER &&
      existGroup.teacherId != currentUser.id
    ) {
      throw new ForbiddenException('Bu sening guruhing emas');
    }

    const data: any = {};

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

  async deleteGroupById(groupId: number, currentUser: { id: number }) {
    const existGroup = await this.prisma.group.findUnique({
      where: {
        id: groupId,
        status: Status.ACTIVE,
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
