import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AttendanceStatus, Prisma, Status } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import type { V2Actor } from '../common/v2-auth.guard';
import { V2AuditService, diff } from '../common/v2-audit.service';
import { pageOf } from '../common/v2-pagination';
import { V2ScopeService, type OrgWhere } from '../common/v2-scope.service';
import { V2StaffService } from '../common/v2-staff.service';
import {
  parseId,
  toId,
  toTeacherId,
} from '../common/v2.mapper';
import type {
  V2AttendanceHistoryQueryDto,
  V2BatchAttendanceDto,
  V2CreateLessonDto,
  V2LessonsQueryDto,
  V2UpdateLessonDto,
} from './v2-lessons.dto';

const TO_DB_STATUS: Record<string, AttendanceStatus> = {
  present: AttendanceStatus.PRESENT,
  absent: AttendanceStatus.ABSENT,
  late: AttendanceStatus.LATE,
  excused: AttendanceStatus.EXCUSED,
};

export const toV2Attendance = (status: AttendanceStatus) =>
  status.toLowerCase() as 'present' | 'absent' | 'late' | 'excused';

export const LESSON_SELECT = {
  id: true,
  title: true,
  date: true,
  lessonType: true,
  groupId: true,
  userId: true,
  teacherId: true,
  created_at: true,
  group: {
    select: {
      name: true,
      branchId: true,
      organizationId: true,
      teacherId: true,
      teacher: { select: { fullName: true } },
      _count: {
        select: {
          studentGroup: {
            where: { status: Status.ACTIVE, student: { deleted_at: null } },
          },
        },
      },
    },
  },
  attendances: { select: { status: true } },
} satisfies Prisma.LessonSelect;

export type LessonRow = Prisma.LessonGetPayload<{
  select: typeof LESSON_SELECT;
}>;

/** Darsni kim yaratgan: xodim (`"12"`) yoki o'qituvchi (`"t12"`). */
const creatorOf = (row: { userId: number | null; teacherId: number | null }) =>
  row.teacherId
    ? toTeacherId(row.teacherId)
    : row.userId
      ? toId(row.userId)
      : '';

@Injectable()
export class V2LessonsService {
  constructor(
    private prisma: PrismaService,
    private scope: V2ScopeService,
    private staff: V2StaffService,
    private audit: V2AuditService,
  ) {}

  async list(
    user: RequestUser,
    actor: V2Actor,
    query: V2LessonsQueryDto,
    headerBranchId: number | null,
  ) {
    const { page, limit, skip } = pageOf(query, 50);
    const { org, branchId } = await this.scope.read(user, actor, headerBranchId);
    if (!org) return { data: { data: [], total: 0, page, limit } };

    const where: Prisma.LessonWhereInput = {
      ...this.scopeWhere(org, branchId, actor),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              {
                group: {
                  name: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.lesson.count({ where }),
      this.prisma.lesson.findMany({
        where,
        select: LESSON_SELECT,
        orderBy: [{ date: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
        skip,
        take: limit,
      }),
    ]);

    // Frontend bu ro'yxatni tekis `{ data, total, page, limit }` deb kutadi.
    return {
      data: { data: rows.map((row) => this.toSummary(row)), total, page, limit },
    };
  }

  async detail(user: RequestUser, actor: V2Actor, id: number) {
    const row = await this.findOwned(user, actor, id);
    const records = await this.prisma.attendance.findMany({
      where: { lessonId: id },
      select: {
        id: true,
        studentId: true,
        status: true,
        comment: true,
        userId: true,
        teacherId: true,
        student: { select: { fullName: true } },
      },
      orderBy: { student: { fullName: 'asc' } },
    });
    const markers = await this.staff.summaries(
      records.map((record) => creatorOf(record)),
    );

    return {
      data: {
        ...this.toLesson(row),
        attendance: records.map((record) => {
          const markedBy = creatorOf(record);
          return {
            id: toId(record.id),
            student_id: toId(record.studentId),
            student_name: record.student.fullName,
            status: toV2Attendance(record.status),
            ...(record.comment ? { notes: record.comment } : {}),
            marked_by_id: markedBy,
            ...(markers.get(markedBy)
              ? { marked_by_name: markers.get(markedBy)?.name }
              : {}),
          };
        }),
      },
    };
  }

  async create(user: RequestUser, actor: V2Actor, payload: V2CreateLessonDto) {
    const groupId = parseId(payload.groupId, 'Guruh');
    const group = await this.ownedGroup(user, actor, groupId);

    const row = await this.prisma.lesson.create({
      data: {
        groupId,
        title: payload.title,
        date: new Date(payload.date),
        lessonType: payload.lessonType,
        ...this.creator(actor),
      },
      select: LESSON_SELECT,
    });

    await this.audit.record(actor, 'CREATE', 'lesson', row.id, {
      organizationId: group.organizationId,
      branchId: group.branchId,
      changes: { title: row.title, date: payload.date, group: group.name },
    });

    return { data: { ...this.toLesson(row), attendance: [] } };
  }

  async update(
    user: RequestUser,
    actor: V2Actor,
    id: number,
    payload: V2UpdateLessonDto,
  ) {
    const before = await this.findOwned(user, actor, id);
    this.assertCanEdit(actor, before);

    const row = await this.prisma.lesson.update({
      where: { id },
      data: {
        ...(payload.title !== undefined ? { title: payload.title } : {}),
        ...(payload.date ? { date: new Date(payload.date) } : {}),
        ...(payload.lessonType ? { lessonType: payload.lessonType } : {}),
      },
      select: LESSON_SELECT,
    });

    await this.audit.record(actor, 'UPDATE', 'lesson', id, {
      organizationId: row.group.organizationId,
      branchId: row.group.branchId,
      changes: diff(this.toLesson(before), this.toLesson(row)),
    });

    return this.detail(user, actor, id);
  }

  /** Davomat yozuvlari bilan birga o'chadi. */
  async remove(user: RequestUser, actor: V2Actor, id: number): Promise<void> {
    const row = await this.findOwned(user, actor, id);
    this.assertCanEdit(actor, row);

    const [homework, exams] = await Promise.all([
      this.prisma.homework.count({ where: { lessonId: id } }),
      this.prisma.exam.count({ where: { lessonId: id } }),
    ]);
    if (homework || exams) {
      throw new BadRequestException(
        'Darsga uyga vazifa yoki imtihon biriktirilgan — avval ularni o‘chiring',
      );
    }

    await this.prisma.$transaction([
      this.prisma.attendance.deleteMany({ where: { lessonId: id } }),
      this.prisma.grade.updateMany({
        where: { lessonId: id },
        data: { lessonId: null },
      }),
      this.prisma.rating.deleteMany({ where: { lessonId: id } }),
      this.prisma.lessonVideo.deleteMany({ where: { lessonId: id } }),
      this.prisma.lesson.delete({ where: { id } }),
    ]);
    await this.audit.record(actor, 'DELETE', 'lesson', id, {
      organizationId: row.group.organizationId,
      branchId: row.group.branchId,
      changes: { title: row.title },
    });
  }

  /** Bir darsning davomati — mavjud yozuvlar yangilanadi, yo'qlari qo'shiladi. */
  async batch(user: RequestUser, actor: V2Actor, payload: V2BatchAttendanceDto) {
    const lessonId = parseId(payload.lessonId, 'Dars');
    const lesson = await this.findOwned(user, actor, lessonId);

    const studentIds = payload.records.map((record) =>
      parseId(record.studentId, 'O‘quvchi'),
    );
    if (
      payload.records.some(
        (record) => record.lessonId && record.lessonId !== payload.lessonId,
      )
    ) {
      throw new BadRequestException('Davomat boshqa darsga tegishli');
    }

    const members = await this.prisma.student.findMany({
      where: {
        id: { in: studentIds },
        organizationId: lesson.group.organizationId ?? undefined,
      },
      select: { id: true },
    });
    const allowed = new Set(members.map((member) => member.id));
    if (studentIds.some((id) => !allowed.has(id))) {
      throw new BadRequestException('O‘quvchi topilmadi');
    }

    const existing = await this.prisma.attendance.findMany({
      where: { lessonId, studentId: { in: studentIds } },
      select: { id: true, studentId: true },
    });
    const byStudent = new Map(existing.map((row) => [row.studentId, row.id]));
    const marker = this.creator(actor);

    await this.prisma.$transaction(
      payload.records.map((record, index) => {
        const studentId = studentIds[index];
        const status = TO_DB_STATUS[record.status];
        const data = {
          status,
          isPresent:
            status === AttendanceStatus.PRESENT ||
            status === AttendanceStatus.LATE,
          comment: record.notes?.trim() || null,
          ...marker,
        };
        const id = byStudent.get(studentId);

        return id
          ? this.prisma.attendance.update({ where: { id }, data })
          : this.prisma.attendance.create({
              data: { ...data, lessonId, studentId },
            });
      }),
    );

    await this.audit.record(actor, 'UPDATE', 'attendance', lessonId, {
      organizationId: lesson.group.organizationId,
      branchId: lesson.group.branchId,
      changes: { records: payload.records.length },
    });

    return { data: { lesson_id: toId(lessonId), saved: payload.records.length } };
  }

  /** O'quvchining davomat tarixi (eng yangisi birinchi). */
  async history(
    user: RequestUser,
    actor: V2Actor,
    query: V2AttendanceHistoryQueryDto,
  ) {
    const studentId = parseId(query.student_id, 'O‘quvchi');
    const org = this.scope.org(user);
    if (!org) return { data: [] };

    const rows = await this.prisma.attendance.findMany({
      where: {
        studentId,
        student: { ...org },
        lesson: {
          group: actor.ref.kind === 'teacher' ? { teacherId: actor.ref.id } : {},
        },
      },
      select: {
        id: true,
        status: true,
        created_at: true,
        lesson: {
          select: { date: true, created_at: true, group: { select: { name: true } } },
        },
      },
      orderBy: { created_at: 'desc' },
      take: query.limit ?? 20,
    });

    return {
      data: rows.map((row) => ({
        id: toId(row.id),
        date: (row.lesson.date ?? row.lesson.created_at).toISOString(),
        group_name: row.lesson.group.name,
        status: toV2Attendance(row.status),
      })),
    };
  }

  scopeWhere(
    org: OrgWhere,
    branchId: number | null,
    actor: V2Actor,
  ): Prisma.LessonWhereInput {
    return {
      group: {
        ...org,
        deleted_at: null,
        ...(branchId ? { branchId } : {}),
      },
      ...(actor.ref.kind === 'teacher'
        ? {
            OR: [
              { teacherId: actor.ref.id },
              { group: { teacherId: actor.ref.id } },
            ],
          }
        : {}),
    };
  }

  toLesson(row: LessonRow) {
    return {
      id: toId(row.id),
      title: row.title,
      date: (row.date ?? row.created_at).toISOString(),
      lesson_type: row.lessonType as 'theory' | 'practice',
      group_id: toId(row.groupId),
      group_name: row.group.name,
      branch_id: row.group.branchId ? toId(row.group.branchId) : '',
      created_by_id: creatorOf(row),
      created_at: row.created_at.toISOString(),
    };
  }

  toSummary(row: LessonRow) {
    const marked = row.attendances.length;
    const present = row.attendances.filter(
      (record) =>
        record.status === AttendanceStatus.PRESENT ||
        record.status === AttendanceStatus.LATE,
    ).length;

    return {
      ...this.toLesson(row),
      ...(row.group.teacher ? { teacher_name: row.group.teacher.fullName } : {}),
      present_count: present,
      total_count: Math.max(marked, row.group._count.studentGroup),
    };
  }

  private creator(actor: V2Actor) {
    return actor.ref.kind === 'teacher'
      ? { teacherId: actor.ref.id, userId: null }
      : { userId: actor.ref.id, teacherId: null };
  }

  /** O'qituvchi faqat o'zi yaratgan darsni o'zgartiradi/o'chiradi. */
  private assertCanEdit(actor: V2Actor, row: LessonRow) {
    if (actor.role === 'operator') throw new ForbiddenException();
    if (actor.ref.kind === 'teacher' && row.teacherId !== actor.ref.id) {
      throw new ForbiddenException('Faqat o‘zingiz yaratgan darsni o‘zgartira olasiz');
    }
  }

  async findOwned(
    user: RequestUser,
    actor: V2Actor,
    id: number,
  ): Promise<LessonRow> {
    const org = this.scope.org(user);
    const row = org
      ? await this.prisma.lesson.findFirst({
          where: { id, ...this.scopeWhere(org, null, actor) },
          select: LESSON_SELECT,
        })
      : null;

    if (!row) throw new NotFoundException('Dars topilmadi');
    return row;
  }

  private async ownedGroup(user: RequestUser, actor: V2Actor, id: number) {
    const org = this.scope.org(user);
    const group = org
      ? await this.prisma.group.findFirst({
          where: {
            id,
            ...org,
            deleted_at: null,
            ...(actor.ref.kind === 'teacher' ? { teacherId: actor.ref.id } : {}),
          },
          select: { id: true, name: true, branchId: true, organizationId: true },
        })
      : null;

    if (!group) throw new NotFoundException('Guruh topilmadi');
    return group;
  }
}
