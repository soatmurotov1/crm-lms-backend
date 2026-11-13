import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationAudience,
  NotificationType,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import type { V2Actor } from '../common/v2-auth.guard';
import { pageOf, paginated } from '../common/v2-pagination';
import { USER_ROLE_OF, parseStaffId, toId } from '../common/v2.mapper';
import { LmsAccessService } from './lms-access.service';
import type { CreateNotificationDto, NotificationsQueryDto } from './lms.dto';

const TYPE_OF: Record<string, NotificationType> = {
  info: NotificationType.INFO,
  warning: NotificationType.WARNING,
  lesson: NotificationType.LESSON,
  homework: NotificationType.HOMEWORK,
  payment: NotificationType.PAYMENT,
  system: NotificationType.SYSTEM,
};
const AUDIENCE_OF: Record<string, NotificationAudience> = {
  all: NotificationAudience.ALL,
  teachers: NotificationAudience.TEACHERS,
  students: NotificationAudience.STUDENTS,
  group: NotificationAudience.GROUP,
  user: NotificationAudience.USER,
};

@Injectable()
export class LmsNotificationsService {
  constructor(
    private prisma: PrismaService,
    private access: LmsAccessService,
  ) {}

  /** Aktor qabul qiluvchi sifatida: `Role` + id. */
  private me(actor: V2Actor): { role: Role; id: number } {
    if (actor.ref.kind === 'teacher') return { role: Role.TEACHER, id: actor.ref.id };
    return { role: USER_ROLE_OF[actor.role] ?? Role.ADMIN, id: actor.ref.id };
  }

  private async visibleWhere(
    user: RequestUser,
    actor: V2Actor,
  ): Promise<Prisma.NotificationWhereInput | null> {
    const org = this.access.orgWhere(user);
    if (!org) return null;
    const me = this.me(actor);
    const teacherGroups = (await this.access.teacherGroupIds(actor)) ?? [];
    const isTeacher = me.role === Role.TEACHER;
    return {
      ...org,
      OR: [
        { audience: NotificationAudience.ALL },
        { audience: NotificationAudience.ORGANIZATION },
        isTeacher
          ? { audience: NotificationAudience.TEACHERS }
          : { audience: NotificationAudience.ADMINS },
        ...(isTeacher
          ? [{ audience: NotificationAudience.GROUP, groupId: { in: teacherGroups } }]
          : []),
        { audience: NotificationAudience.USER, recipientRole: me.role, recipientId: me.id },
        { createdByRole: me.role, createdById: me.id },
      ],
    };
  }

  async list(user: RequestUser, actor: V2Actor, query: NotificationsQueryDto) {
    const { page, limit, skip, take } = pageOf(query);
    const base = await this.visibleWhere(user, actor);
    if (!base) return { ...paginated([], 0, page, limit), unread_count: 0 };
    const me = this.me(actor);
    const unreadFilter: Prisma.NotificationWhereInput = {
      reads: { none: { recipientRole: me.role, recipientId: me.id } },
    };
    const where: Prisma.NotificationWhereInput = query.unread
      ? { AND: [base, unreadFilter] }
      : base;

    const [total, rows, unread] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        include: {
          group: { select: { name: true } },
          reads: { where: { recipientRole: me.role, recipientId: me.id }, select: { readAt: true } },
        },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.notification.count({ where: { AND: [base, unreadFilter] } }),
    ]);
    return {
      ...paginated(
        rows.map((row) => ({
          id: toId(row.id),
          title: row.title,
          message: row.message,
          type: row.type.toLowerCase(),
          audience: row.audience.toLowerCase(),
          group_id: row.groupId ? toId(row.groupId) : null,
          group_name: row.group?.name ?? null,
          recipient_name: row.recipientName,
          created_by_name: row.createdByName,
          is_mine: row.createdByRole === me.role && row.createdById === me.id,
          read: row.reads.length > 0,
          read_at: row.reads[0]?.readAt.toISOString() ?? null,
          created_at: row.created_at.toISOString(),
        })),
        total,
        page,
        limit,
      ),
      unread_count: unread,
    };
  }

  async unreadCount(user: RequestUser, actor: V2Actor) {
    const base = await this.visibleWhere(user, actor);
    if (!base) return { data: { unread_count: 0 } };
    const me = this.me(actor);
    const count = await this.prisma.notification.count({
      where: {
        AND: [base, { reads: { none: { recipientRole: me.role, recipientId: me.id } } }],
      },
    });
    return { data: { unread_count: count } };
  }

  async create(
    user: RequestUser,
    actor: V2Actor,
    payload: CreateNotificationDto,
    branchId: number | null,
  ) {
    const organizationId = await this.access.writeOrg(user, branchId);
    const me = this.me(actor);
    let groupId: number | null = null;
    let recipient: { role: Role; id: number; name: string } | null = null;

    if (payload.audience === 'group') {
      const group = await this.access.group(organizationId, payload.group_id, actor);
      if (!group) throw new BadRequestException('Guruhni tanlang');
      groupId = group.id;
    } else if (payload.audience === 'user') {
      const ref = parseStaffId(payload.recipient_id);
      if (!ref) throw new BadRequestException('Qabul qiluvchini tanlang');
      recipient = await this.recipient(organizationId, ref);
    } else if (me.role === Role.TEACHER) {
      throw new ForbiddenException('O‘qituvchi faqat o‘z guruhiga yoki shaxsga yuboradi');
    }

    const row = await this.prisma.notification.create({
      data: {
        organizationId,
        title: payload.title,
        message: payload.message,
        type: TYPE_OF[payload.type ?? 'info'],
        audience: AUDIENCE_OF[payload.audience],
        groupId,
        recipientRole: recipient?.role ?? null,
        recipientId: recipient?.id ?? null,
        recipientName: recipient?.name ?? null,
        createdByRole: me.role,
        createdById: me.id,
        createdByName: actor.name,
        // Yuboruvchi o'z xabarini o'qilgan deb ko'radi.
        reads: { create: { recipientRole: me.role, recipientId: me.id } },
      },
    });
    return { data: { id: toId(row.id), created_at: row.created_at.toISOString() } };
  }

  async markRead(user: RequestUser, actor: V2Actor, id: number) {
    const base = await this.visibleWhere(user, actor);
    const row = base
      ? await this.prisma.notification.findFirst({ where: { AND: [base, { id }] }, select: { id: true } })
      : null;
    if (!row) throw new NotFoundException('Bildirishnoma topilmadi');
    const me = this.me(actor);
    await this.prisma.notificationRead.upsert({
      where: {
        notificationId_recipientRole_recipientId: {
          notificationId: id,
          recipientRole: me.role,
          recipientId: me.id,
        },
      },
      update: {},
      create: { notificationId: id, recipientRole: me.role, recipientId: me.id },
    });
    return this.unreadCount(user, actor);
  }

  async markAllRead(user: RequestUser, actor: V2Actor) {
    const base = await this.visibleWhere(user, actor);
    if (!base) return { data: { unread_count: 0 } };
    const me = this.me(actor);
    const rows = await this.prisma.notification.findMany({
      where: { AND: [base, { reads: { none: { recipientRole: me.role, recipientId: me.id } } }] },
      select: { id: true },
    });
    if (rows.length) {
      await this.prisma.notificationRead.createMany({
        data: rows.map((row) => ({
          notificationId: row.id,
          recipientRole: me.role,
          recipientId: me.id,
        })),
        skipDuplicates: true,
      });
    }
    return { data: { unread_count: 0, marked: rows.length } };
  }

  async remove(user: RequestUser, actor: V2Actor, id: number): Promise<void> {
    const org = this.access.orgWhere(user);
    const row = org
      ? await this.prisma.notification.findFirst({ where: { id, ...org } })
      : null;
    if (!row) throw new NotFoundException('Bildirishnoma topilmadi');
    const me = this.me(actor);
    const isAuthor = row.createdByRole === me.role && row.createdById === me.id;
    if (!isAuthor && !['dev', 'owner', 'manager'].includes(actor.role)) {
      throw new ForbiddenException('Faqat muallif yoki administrator o‘chiradi');
    }
    await this.prisma.notification.delete({ where: { id } });
  }

  private async recipient(organizationId: number, ref: { kind: 'user' | 'teacher'; id: number }) {
    if (ref.kind === 'teacher') {
      const row = await this.prisma.teacher.findFirst({
        where: { id: ref.id, organizationId, deleted_at: null },
        select: { id: true, fullName: true },
      });
      if (!row) throw new BadRequestException('Qabul qiluvchi topilmadi');
      return { role: Role.TEACHER, id: row.id, name: row.fullName };
    }
    const row = await this.prisma.user.findFirst({
      where: { id: ref.id, organizationId, deleted_at: null },
      select: { id: true, fullName: true, role: true },
    });
    if (!row) throw new BadRequestException('Qabul qiluvchi topilmadi');
    return { role: row.role, id: row.id, name: row.fullName };
  }
}

