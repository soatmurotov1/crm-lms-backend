import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationAudience, Prisma, Role } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';

type CurrentUser = { id: number; role: Role };

const ADMIN_ROLES: Role[] = [
  Role.ADMIN,
  Role.SUPERADMIN,
  Role.MANAGEMENT,
  Role.ADMINSTRATOR,
];

/** Xabarnomalarni ko'rsatishda doim biriktiriladigan bog'liq ma'lumotlar. */
const RELATION_INCLUDE = {
  group: { select: { id: true, name: true } },
  organization: { select: { id: true, name: true } },
} satisfies Prisma.NotificationInclude;

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Foydalanuvchi roliga mos xabarnomalar. Bularga o'z guruhiga, o'z
   * tashkilotiga va shaxsan o'ziga yuborilganlar ham kiradi.
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
    const organizationId = await this.getOrganizationIdForUser(currentUser);

    const notifications = await this.prisma.notification.findMany({
      where: {
        OR: [
          { audience: { in: audiences } },
          {
            audience: NotificationAudience.USER,
            recipientRole: currentUser.role,
            recipientId: currentUser.id,
          },
          ...(groupIds.length
            ? [
                {
                  audience: NotificationAudience.GROUP,
                  groupId: { in: groupIds },
                },
              ]
            : []),
          ...(organizationId
            ? [
                {
                  audience: NotificationAudience.ORGANIZATION,
                  organizationId,
                },
              ]
            : []),
        ],
      },
      include: {
        ...RELATION_INCLUDE,
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
        ...RELATION_INCLUDE,
        _count: { select: { reads: true } },
      },
      orderBy: { created_at: 'desc' },
      take: Number(limit) || 100,
    });

    return { success: true, data: notifications };
  }

  async create(payload: CreateNotificationDto, currentUser: CurrentUser) {
    const audience = payload.audience ?? NotificationAudience.ALL;

    if (audience === NotificationAudience.GROUP && !payload.groupId) {
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

    /*
      O'qituvchi butun tizimga xabar yubora olmaydi. Lekin o'z guruhidan
      tashqari, o'sha guruhlardagi aniq bir o'quvchiga ham yozishi kerak —
      masalan uy vazifasi yoki davomat bo'yicha shaxsiy eslatma.
    */
    if (currentUser.role === Role.TEACHER) {
      if (audience === NotificationAudience.USER) {
        if (payload.recipientRole !== Role.STUDENT) {
          throw new ForbiddenException(
            "O'qituvchi faqat o'z o'quvchisiga xabar yubora oladi",
          );
        }

        await this.ensureStudentIsInTeacherGroup(
          Number(payload.recipientId),
          currentUser.id,
        );
      } else if (audience !== NotificationAudience.GROUP) {
        throw new ForbiddenException(
          "O'qituvchi faqat o'z guruhiga yoki o'z o'quvchisiga xabar yubora oladi",
        );
      }
    }

    // Aniq tashkilotga yuborish: xabar shu tashkilotga biriktirilgan
    // foydalanuvchilarga ko'rinadi.
    let organizationId: number | undefined;
    if (audience === NotificationAudience.ORGANIZATION) {
      if (!payload.organizationId) {
        throw new BadRequestException('Tashkilot tanlanmagan');
      }

      const organization = await this.prisma.organization.findUnique({
        where: { id: payload.organizationId },
        select: { id: true },
      });

      if (!organization) {
        throw new NotFoundException('Tashkilot topilmadi');
      }

      organizationId = organization.id;
    } else {
      organizationId = payload.organizationId;
    }

    // Aniq bir shaxsga yuborish: hisob uch jadvaldan birida bo'ladi.
    let recipientName: string | null = null;
    if (audience === NotificationAudience.USER) {
      if (!payload.recipientRole || !payload.recipientId) {
        throw new BadRequestException('Qabul qiluvchi tanlanmagan');
      }

      recipientName = await this.getAccountName(
        payload.recipientRole,
        payload.recipientId,
      );

      if (recipientName === null) {
        throw new NotFoundException('Qabul qiluvchi topilmadi');
      }
    }

    const sender = await this.getSenderName(currentUser);

    const notification = await this.prisma.notification.create({
      data: {
        title: payload.title,
        message: payload.message,
        type: payload.type,
        audience,
        groupId: payload.groupId,
        organizationId,
        recipientRole:
          audience === NotificationAudience.USER
            ? payload.recipientRole
            : undefined,
        recipientId:
          audience === NotificationAudience.USER
            ? payload.recipientId
            : undefined,
        recipientName,
        createdByRole: currentUser.role,
        createdById: currentUser.id,
        createdByName: sender,
      },
      include: RELATION_INCLUDE,
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

  /** O'quvchi shu o'qituvchining guruhlaridan birida bo'lishi shart. */
  private async ensureStudentIsInTeacherGroup(
    studentId: number,
    teacherId: number,
  ) {
    if (!studentId) {
      throw new BadRequestException('Qabul qiluvchi tanlanmagan');
    }

    const membership = await this.prisma.studentGroup.findFirst({
      where: {
        studentId,
        status: 'ACTIVE',
        group: { teacherId },
      },
      select: { id: true },
    });

    if (!membership) {
      throw new ForbiddenException(
        "Bu o'quvchi sizning guruhlaringizda emas",
      );
    }
  }

  /** Faqat User jadvalidagi hisoblar tashkilotga biriktiriladi. */
  private async getOrganizationIdForUser(currentUser: CurrentUser) {
    if (
      currentUser.role === Role.STUDENT ||
      currentUser.role === Role.TEACHER
    ) {
      return null;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { organizationId: true },
    });

    return user?.organizationId ?? null;
  }

  /**
   * Rol va id bo'yicha hisob egasining ismini qaytaradi.
   * Hisob topilmasa `null` qaytadi.
   */
  private async getAccountName(role: Role, id: number) {
    if (role === Role.TEACHER) {
      const teacher = await this.prisma.teacher.findUnique({
        where: { id },
        select: { fullName: true },
      });
      return teacher?.fullName ?? null;
    }

    if (role === Role.STUDENT) {
      const student = await this.prisma.student.findUnique({
        where: { id },
        select: { fullName: true },
      });
      return student?.fullName ?? null;
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { fullName: true, role: true },
    });

    // Rol mos kelmasa, xabar noto'g'ri odamga ketib qolmasligi kerak.
    if (!user || user.role !== role) return null;

    return user.fullName;
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
