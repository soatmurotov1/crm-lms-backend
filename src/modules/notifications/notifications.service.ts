import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationAudience, Role } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';

type CurrentUser = { id: number; role: Role };

const ADMIN_ROLES: Role[] = [
  Role.ADMIN,
  Role.SUPERADMIN,
  Role.MANAGEMENT,
  Role.ADMINSTRATOR,
];

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Foydalanuvchi roliga mos xabarnomalar. Talaba uchun o'z guruhiga
   * yuborilganlari ham qo'shiladi.
   */
  async getMine(currentUser: CurrentUser, limit = 50) {
    const audiences: NotificationAudience[] = [NotificationAudience.ALL];

    if (currentUser.role === Role.STUDENT) {
      audiences.push(NotificationAudience.STUDENTS);
    } else if (currentUser.role === Role.TEACHER) {
      audiences.push(NotificationAudience.TEACHERS);
    } else {
      audiences.push(NotificationAudience.ADMINS);
    }

    const groupIds = await this.getGroupIdsForUser(currentUser);

    const notifications = await this.prisma.notification.findMany({
      where: {
        OR: [
          { audience: { in: audiences } },
          ...(groupIds.length
            ? [
                {
                  audience: NotificationAudience.GROUP,
                  groupId: { in: groupIds },
                },
              ]
            : []),
        ],
      },
      include: {
        group: { select: { id: true, name: true } },
        reads: {
          where: {
            recipientRole: currentUser.role,
            recipientId: currentUser.id,
          },
          select: { readAt: true },
        },
      },
      orderBy: { created_at: 'desc' },
      take: Number(limit) || 50,
    });

    const data = notifications.map((notification) => ({
      ...notification,
      isRead: notification.reads.length > 0,
      reads: undefined,
    }));

    return {
      success: true,
      unreadCount: data.filter((item) => !item.isRead).length,
      data,
    };
  }

  /** Admin / superadmin uchun yuborilgan xabarnomalar tarixi. */
  async getAll(limit = 100) {
    const notifications = await this.prisma.notification.findMany({
      include: {
        group: { select: { id: true, name: true } },
        _count: { select: { reads: true } },
      },
      orderBy: { created_at: 'desc' },
      take: Number(limit) || 100,
    });

    return { success: true, data: notifications };
  }

  async create(payload: CreateNotificationDto, currentUser: CurrentUser) {
    if (payload.audience === NotificationAudience.GROUP && !payload.groupId) {
      throw new NotFoundException('Guruh tanlanmagan');
    }

    if (payload.groupId) {
      const group = await this.prisma.group.findUnique({
        where: { id: payload.groupId },
        select: { id: true, teacherId: true },
      });

      if (!group) {
        throw new NotFoundException('Guruh topilmadi');
      }

      // O'qituvchi faqat o'z guruhiga xabar yubora oladi.
      if (
        currentUser.role === Role.TEACHER &&
        group.teacherId !== currentUser.id
      ) {
        throw new ForbiddenException('Bu sizning guruhingiz emas');
      }
    }

    if (
      currentUser.role === Role.TEACHER &&
      payload.audience !== NotificationAudience.GROUP
    ) {
      throw new ForbiddenException(
        "O'qituvchi faqat o'z guruhiga xabar yubora oladi",
      );
    }

    const sender = await this.getSenderName(currentUser);

    const notification = await this.prisma.notification.create({
      data: {
        title: payload.title,
        message: payload.message,
        type: payload.type,
        audience: payload.audience ?? NotificationAudience.ALL,
        groupId: payload.groupId,
        organizationId: payload.organizationId,
        createdByRole: currentUser.role,
        createdById: currentUser.id,
        createdByName: sender,
      },
      include: { group: { select: { id: true, name: true } } },
    });

    return {
      success: true,
      message: 'Xabarnoma yuborildi',
      data: notification,
    };
  }

  async markAsRead(notificationId: number, currentUser: CurrentUser) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      select: { id: true },
    });

    if (!notification) {
      throw new NotFoundException('Xabarnoma topilmadi');
    }

    await this.prisma.notificationRead.upsert({
      where: {
        notificationId_recipientRole_recipientId: {
          notificationId,
          recipientRole: currentUser.role,
          recipientId: currentUser.id,
        },
      },
      create: {
        notificationId,
        recipientRole: currentUser.role,
        recipientId: currentUser.id,
      },
      update: { readAt: new Date() },
    });

    return { success: true, message: "O'qilgan deb belgilandi" };
  }

  async markAllAsRead(currentUser: CurrentUser) {
    const { data } = await this.getMine(currentUser, 200);
    const unread = data.filter((item) => !item.isRead);

    if (unread.length === 0) {
      return { success: true, message: "O'qilmagan xabarnoma yo'q" };
    }

    await this.prisma.notificationRead.createMany({
      data: unread.map((item) => ({
        notificationId: item.id,
        recipientRole: currentUser.role,
        recipientId: currentUser.id,
      })),
      skipDuplicates: true,
    });

    return { success: true, message: `${unread.length} ta xabar o'qildi` };
  }

  async remove(id: number, currentUser: CurrentUser) {
    if (!ADMIN_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Ruxsat yo‘q');
    }

    const notification = await this.prisma.notification.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!notification) {
      throw new NotFoundException('Xabarnoma topilmadi');
    }

    await this.prisma.notification.delete({ where: { id } });

    return { success: true, message: "Xabarnoma o'chirildi" };
  }

  private async getGroupIdsForUser(currentUser: CurrentUser) {
    if (currentUser.role === Role.STUDENT) {
      const studentGroups = await this.prisma.studentGroup.findMany({
        where: { studentId: currentUser.id, status: 'ACTIVE' },
        select: { groupId: true },
      });
      return studentGroups.map((item) => item.groupId);
    }

    if (currentUser.role === Role.TEACHER) {
      const groups = await this.prisma.group.findMany({
        where: { teacherId: currentUser.id },
        select: { id: true },
      });
      return groups.map((group) => group.id);
    }

    return [];
  }

  private async getSenderName(currentUser: CurrentUser) {
    if (currentUser.role === Role.TEACHER) {
      const teacher = await this.prisma.teacher.findUnique({
        where: { id: currentUser.id },
        select: { fullName: true },
      });
      return teacher?.fullName || null;
    }

    if (currentUser.role === Role.STUDENT) {
      const student = await this.prisma.student.findUnique({
        where: { id: currentUser.id },
        select: { fullName: true },
      });
      return student?.fullName || null;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { fullName: true },
    });
    return user?.fullName || null;
  }
}
