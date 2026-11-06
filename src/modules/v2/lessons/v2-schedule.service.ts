import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Status } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import {
  addDays,
  tashkentDateKey,
  tashkentDayStart,
  weekStartKey,
} from 'src/common/utils/tashkent-time.util';
import type { V2Actor } from '../common/v2-auth.guard';
import { V2AuditService } from '../common/v2-audit.service';
import { V2ScopeService } from '../common/v2-scope.service';
import { dayRange } from '../common/v2-where';
import { optionalId, parseId, toId } from '../common/v2.mapper';
import type {
  V2CalendarQueryDto,
  V2CreateTemplateDto,
  V2GenerateLessonsDto,
  V2UpdateTemplateDto,
} from './v2-lessons.dto';
import { LESSON_SELECT, V2LessonsService } from './v2-lessons.service';

const TEMPLATE_SELECT = {
  id: true,
  groupId: true,
  dayOfWeek: true,
  startTime: true,
  endTime: true,
  lessonType: true,
  isActive: true,
  group: {
    select: {
      name: true,
      branchId: true,
      organizationId: true,
      teacher: { select: { fullName: true } },
    },
  },
} satisfies Prisma.ScheduleTemplateSelect;

type TemplateRow = Prisma.ScheduleTemplateGetPayload<{
  select: typeof TEMPLATE_SELECT;
}>;

/** Generatsiya qilinadigan eng ko'p dars (bitta so'rovda). */
const MAX_GENERATED = 2000;

const minutesOf = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

/** `YYYY-MM-DD` → 1 (dushanba) ... 7 (yakshanba). */
const isoDayOf = (key: string) =>
  ((new Date(`${key}T00:00:00.000Z`).getUTCDay() + 6) % 7) + 1;

@Injectable()
export class V2ScheduleService {
  constructor(
    private prisma: PrismaService,
    private scope: V2ScopeService,
    private lessons: V2LessonsService,
    private audit: V2AuditService,
  ) {}

  async templates(
    user: RequestUser,
    actor: V2Actor,
    headerBranchId: number | null,
  ) {
    const { org, branchId } = await this.scope.read(user, actor, headerBranchId);
    if (!org) return { data: [] };

    const rows = await this.prisma.scheduleTemplate.findMany({
      where: { group: this.groupWhere(org, branchId, actor) },
      select: TEMPLATE_SELECT,
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    return { data: rows.map((row) => this.toTemplate(row)) };
  }

  async createTemplate(
    user: RequestUser,
    actor: V2Actor,
    payload: V2CreateTemplateDto,
  ) {
    this.assertTimes(payload.startTime, payload.endTime);
    const group = await this.ownedGroup(user, actor, payload.groupId);

    const row = await this.prisma.scheduleTemplate.create({
      data: {
        groupId: group.id,
        dayOfWeek: payload.dayOfWeek,
        startTime: payload.startTime,
        endTime: payload.endTime,
        lessonType: payload.lessonType,
      },
      select: TEMPLATE_SELECT,
    });
    await this.audit.record(actor, 'CREATE', 'schedule_template', row.id, {
      organizationId: group.organizationId,
      branchId: group.branchId,
      changes: this.toTemplate(row),
    });

    return { data: this.toTemplate(row) };
  }

  async updateTemplate(
    user: RequestUser,
    actor: V2Actor,
    id: number,
    payload: V2UpdateTemplateDto,
  ) {
    const before = await this.findTemplate(user, actor, id);
    this.assertTimes(
      payload.startTime ?? before.startTime,
      payload.endTime ?? before.endTime,
    );
    const group = payload.groupId
      ? await this.ownedGroup(user, actor, payload.groupId)
      : null;

    const row = await this.prisma.scheduleTemplate.update({
      where: { id },
      data: {
        ...(group ? { groupId: group.id } : {}),
        ...(payload.dayOfWeek !== undefined
          ? { dayOfWeek: payload.dayOfWeek }
          : {}),
        ...(payload.startTime ? { startTime: payload.startTime } : {}),
        ...(payload.endTime ? { endTime: payload.endTime } : {}),
        ...(payload.lessonType ? { lessonType: payload.lessonType } : {}),
      },
      select: TEMPLATE_SELECT,
    });
    await this.audit.record(actor, 'UPDATE', 'schedule_template', id, {
      organizationId: row.group.organizationId,
      branchId: row.group.branchId,
      changes: { before: this.toTemplate(before), after: this.toTemplate(row) },
    });

    return { data: this.toTemplate(row) };
  }

  /** Shablon o'chadi; undan yaratilgan darslar qoladi. */
  async deleteTemplate(
    user: RequestUser,
    actor: V2Actor,
    id: number,
  ): Promise<void> {
    const row = await this.findTemplate(user, actor, id);

    await this.prisma.scheduleTemplate.delete({ where: { id } });
    await this.audit.record(actor, 'DELETE', 'schedule_template', id, {
      organizationId: row.group.organizationId,
      branchId: row.group.branchId,
      changes: this.toTemplate(row),
    });
  }

  /**
   * Shablonlar bo'yicha bugundan boshlab `weeks` hafta uchun darslar
   * yaratadi. Xuddi shu vaqtda shu guruhda dars bo'lsa — o'tkazib yuboriladi,
   * shuning uchun qayta bosish xavfsiz.
   */
  async generate(
    user: RequestUser,
    actor: V2Actor,
    payload: V2GenerateLessonsDto,
    headerBranchId: number | null,
    now: Date = new Date(),
  ) {
    const { org, branchId } = await this.scope.read(user, actor, headerBranchId);
    if (!org) return { data: { created: 0, skipped: 0, message: 'Dars yaratilmadi' } };

    const groupId = optionalId(payload.groupId);
    if (groupId === null) throw new NotFoundException('Guruh topilmadi');

    const templates = await this.prisma.scheduleTemplate.findMany({
      where: {
        isActive: true,
        group: {
          ...this.groupWhere(org, branchId, actor),
          status: Status.ACTIVE,
          ...(groupId ? { id: groupId } : {}),
        },
      },
      select: TEMPLATE_SELECT,
    });

    const todayKey = tashkentDateKey(now);
    const days = Array.from({ length: payload.weeks * 7 }, (_, index) =>
      addDays(todayKey, index),
    );
    const planned = templates.flatMap((template) =>
      days
        .filter((key) => isoDayOf(key) === template.dayOfWeek)
        .map((key) => ({
          template,
          date: new Date(
            tashkentDayStart(key).getTime() +
              minutesOf(template.startTime) * 60_000,
          ),
        })),
    );

    if (planned.length > MAX_GENERATED) {
      throw new BadRequestException(
        `Bir martada ${MAX_GENERATED} tadan ortiq dars yaratib bo‘lmaydi — haftalar sonini kamaytiring`,
      );
    }

    const groupIds = [...new Set(templates.map((template) => template.groupId))];
    const existing = planned.length
      ? await this.prisma.lesson.findMany({
          where: {
            groupId: { in: groupIds },
            date: {
              gte: tashkentDayStart(todayKey),
              lt: tashkentDayStart(addDays(todayKey, payload.weeks * 7)),
            },
          },
          select: { groupId: true, date: true },
        })
      : [];
    const taken = new Set(
      existing.map((row) => `${row.groupId}:${row.date?.getTime()}`),
    );

    const creator =
      actor.ref.kind === 'teacher'
        ? { teacherId: actor.ref.id }
        : { userId: actor.ref.id };
    const toCreate = planned.filter(
      ({ template, date }) => !taken.has(`${template.groupId}:${date.getTime()}`),
    );

    if (toCreate.length) {
      await this.prisma.lesson.createMany({
        data: toCreate.map(({ template, date }) => ({
          groupId: template.groupId,
          templateId: template.id,
          date,
          lessonType: template.lessonType,
          title: `${template.group.name} — ${
            template.lessonType === 'practice' ? 'Amaliyot' : 'Nazariya'
          }`,
          ...creator,
        })),
      });
    }

    const skipped = planned.length - toCreate.length;
    await this.audit.record(actor, 'CREATE', 'lesson', groupId ?? 'schedule', {
      organizationId: actor.organizationId,
      branchId,
      changes: { generated: toCreate.length, skipped, weeks: payload.weeks },
    });

    return {
      data: {
        created: toCreate.length,
        skipped,
        message: toCreate.length
          ? `${toCreate.length} ta dars yaratildi`
          : 'Yangi dars yaratilmadi',
      },
    };
  }

  /** Kalendar: oraliqdagi darslar (standart — joriy hafta). */
  async calendar(
    user: RequestUser,
    actor: V2Actor,
    query: V2CalendarQueryDto,
    headerBranchId: number | null,
    now: Date = new Date(),
  ) {
    const { org, branchId } = await this.scope.read(
      user,
      actor,
      headerBranchId,
      query.branch_id,
    );
    if (!org) return { data: [] };

    const fromKey = query.date_from ?? weekStartKey(tashkentDateKey(now));
    const toKey = query.date_to ?? addDays(fromKey, 6);

    const rows = await this.prisma.lesson.findMany({
      where: {
        ...this.lessons.scopeWhere(org, branchId, actor),
        date: dayRange(fromKey, toKey),
      },
      select: LESSON_SELECT,
      orderBy: { date: 'asc' },
      take: 2000,
    });

    return {
      data: rows.map((row) => {
        const summary = this.lessons.toSummary(row);
        return {
          id: summary.id,
          title: summary.title,
          date: summary.date,
          lesson_type: summary.lesson_type,
          group_id: summary.group_id,
          group_name: summary.group_name,
          branch_id: summary.branch_id,
          ...(summary.teacher_name ? { teacher_name: summary.teacher_name } : {}),
          present_count: summary.present_count,
          total_count: summary.total_count,
        };
      }),
    };
  }

  private groupWhere(
    org: { organizationId?: number },
    branchId: number | null,
    actor: V2Actor,
  ): Prisma.GroupWhereInput {
    return {
      ...org,
      deleted_at: null,
      ...(branchId ? { branchId } : {}),
      ...(actor.ref.kind === 'teacher' ? { teacherId: actor.ref.id } : {}),
    };
  }

  private assertTimes(start: string, end: string) {
    if (minutesOf(end) <= minutesOf(start)) {
      throw new BadRequestException(
        'Tugash vaqti boshlanish vaqtidan keyin bo‘lishi kerak',
      );
    }
  }

  private async ownedGroup(user: RequestUser, actor: V2Actor, value: string) {
    const org = this.scope.org(user);
    const id = parseId(value, 'Guruh');
    const group = org
      ? await this.prisma.group.findFirst({
          where: { id, ...this.groupWhere(org, null, actor) },
          select: { id: true, branchId: true, organizationId: true },
        })
      : null;
    if (!group) throw new NotFoundException('Guruh topilmadi');
    return group;
  }

  private async findTemplate(
    user: RequestUser,
    actor: V2Actor,
    id: number,
  ): Promise<TemplateRow> {
    const org = this.scope.org(user);
    const row = org
      ? await this.prisma.scheduleTemplate.findFirst({
          where: { id, group: this.groupWhere(org, null, actor) },
          select: TEMPLATE_SELECT,
        })
      : null;
    if (!row) throw new NotFoundException('Jadval topilmadi');
    return row;
  }

  private toTemplate(row: TemplateRow) {
    return {
      id: toId(row.id),
      group_id: toId(row.groupId),
      group_name: row.group.name,
      day_of_week: row.dayOfWeek,
      start_time: row.startTime,
      end_time: row.endTime,
      lesson_type: row.lessonType as 'theory' | 'practice',
      is_active: row.isActive,
      ...(row.group.teacher ? { teacher_name: row.group.teacher.fullName } : {}),
    };
  }
}
