import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Status, UserStatus } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import type { V2Actor } from '../common/v2-auth.guard';
import { V2AuditService, diff } from '../common/v2-audit.service';
import { V2ScopeService } from '../common/v2-scope.service';
import {
  fromV2CourseType,
  parseStaffId,
  toId,
  toTeacherId,
  toV2CourseType,
} from '../common/v2.mapper';
import {
  STUDENT_SELECT,
  V2StudentMapper,
} from '../students/v2-students.mapper';
import type {
  V2CreateGroupDto,
  V2GroupsQueryDto,
  V2UpdateGroupDto,
} from './v2-groups.dto';

export const GROUP_SELECT = {
  id: true,
  name: true,
  branchId: true,
  organizationId: true,
  courseType: true,
  status: true,
  teacherId: true,
  deleted_at: true,
  created_at: true,
  branch: { select: { name: true } },
  teacher: { select: { fullName: true } },
  course: { select: { type: true } },
  templates: {
    where: { isActive: true },
    select: {
      id: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      lessonType: true,
    },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  },
  _count: {
    select: {
      studentGroup: {
        where: { status: Status.ACTIVE, student: { deleted_at: null } },
      },
    },
  },
} satisfies Prisma.GroupSelect;

type GroupRow = Prisma.GroupGetPayload<{ select: typeof GROUP_SELECT }>;

@Injectable()
export class V2GroupsService {
  constructor(
    private prisma: PrismaService,
    private scope: V2ScopeService,
    private students: V2StudentMapper,
    private audit: V2AuditService,
  ) {}

  async list(
    user: RequestUser,
    actor: V2Actor,
    query: V2GroupsQueryDto,
    headerBranchId: number | null,
  ) {
    const { org, branchId } = await this.scope.read(
      user,
      actor,
      headerBranchId,
      query.branch_id,
    );
    if (!org) return { data: [] };
    if (query.include_deleted && !isOwner(actor)) {
      throw new ForbiddenException();
    }

    const courseType = fromV2CourseType(query.course_type);
    const rows = await this.prisma.group.findMany({
      where: {
        ...org,
        ...this.teacherWhere(actor),
        ...(query.include_deleted ? {} : { deleted_at: null }),
        ...(branchId ? { branchId } : {}),
        ...(courseType ? { courseType } : {}),
        ...(query.search
          ? { name: { contains: query.search, mode: 'insensitive' } }
          : {}),
      },
      select: GROUP_SELECT,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    });

    return { data: rows.map((row) => this.toGroup(row)) };
  }

  /** Filiallar bo'yicha guruhlar (chap paneldagi sonlar uchun). */
  async overview(
    user: RequestUser,
    actor: V2Actor,
    headerBranchId: number | null,
  ) {
    const { org, branchId } = await this.scope.read(user, actor, headerBranchId);
    if (!org) return { data: [] };

    const [branches, rows] = await Promise.all([
      this.prisma.branch.findMany({
        where: {
          ...org,
          status: Status.ACTIVE,
          ...(branchId ? { id: branchId } : {}),
        },
        select: { id: true, name: true },
        orderBy: { id: 'asc' },
      }),
      this.prisma.group.findMany({
        where: {
          ...org,
          ...this.teacherWhere(actor),
          deleted_at: null,
          ...(branchId ? { branchId } : {}),
        },
        select: GROUP_SELECT,
        orderBy: { name: 'asc' },
      }),
    ]);

    return {
      data: branches.map((branch) => ({
        branch_id: toId(branch.id),
        branch_name: branch.name,
        groups: rows
          .filter((row) => row.branchId === branch.id)
          .map((row) => this.toGroup(row)),
      })),
    };
  }

  async detail(user: RequestUser, actor: V2Actor, id: number) {
    const row = await this.findOwned(user, actor, id);
    const members = await this.prisma.student.findMany({
      where: {
        deleted_at: null,
        studentGroups: { some: { groupId: id, status: Status.ACTIVE } },
      },
      select: STUDENT_SELECT,
      orderBy: [{ lastName: 'asc' }, { fullName: 'asc' }],
    });

    return {
      data: {
        ...this.toGroup(row),
        students: await this.students.many(members, actor),
      },
    };
  }

  async create(
    user: RequestUser,
    actor: V2Actor,
    payload: V2CreateGroupDto,
    headerBranchId: number | null,
  ) {
    const { branchId, organizationId } = await this.scope.writeBranch(
      user,
      actor,
      headerBranchId,
      payload.branchId,
    );
    const teacherId = await this.resolveTeacher(
      payload.teacherId,
      organizationId,
    );

    const row = await this.prisma.group.create({
      data: {
        name: payload.name,
        branchId,
        organizationId,
        courseType: fromV2CourseType(payload.courseType),
        teacherId: teacherId ?? null,
        userId: actor.ref.kind === 'user' ? actor.ref.id : null,
        startDate: new Date(),
      },
      select: GROUP_SELECT,
    });

    await this.audit.record(actor, 'CREATE', 'group', row.id, {
      organizationId,
      branchId,
      changes: { name: row.name, teacher_id: payload.teacherId ?? null },
    });

    return { data: this.toGroup(row) };
  }

  async update(
    user: RequestUser,
    actor: V2Actor,
    id: number,
    payload: V2UpdateGroupDto,
  ) {
    const before = await this.findOwned(user, actor, id);
    const organizationId = before.organizationId ?? actor.organizationId;
    if (!organizationId) throw new NotFoundException('Guruh topilmadi');

    const branchId =
      payload.branchId !== undefined
        ? (await this.scope.writeBranch(user, actor, null, payload.branchId))
            .branchId
        : undefined;
    const teacherId = await this.resolveTeacher(
      payload.teacherId,
      organizationId,
    );

    const row = await this.prisma.group.update({
      where: { id },
      data: {
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(branchId !== undefined ? { branchId } : {}),
        ...(payload.courseType
          ? { courseType: fromV2CourseType(payload.courseType) }
          : {}),
        ...(teacherId !== undefined ? { teacherId } : {}),
      },
      select: GROUP_SELECT,
    });

    await this.audit.record(actor, 'UPDATE', 'group', id, {
      organizationId,
      branchId: row.branchId,
      changes: diff(this.toGroup(before), this.toGroup(row)),
    });

    return { data: this.toGroup(row) };
  }

  /**
   * Guruh yashiriladi va undagi o'quvchilar guruhsiz qoladi (a'zolik
   * yopiladi). Tiklash a'zoliklarni qaytarmaydi.
   */
  async remove(user: RequestUser, actor: V2Actor, id: number): Promise<void> {
    const row = await this.findOwned(user, actor, id);

    await this.prisma.$transaction([
      this.prisma.group.update({
        where: { id },
        data: { deleted_at: new Date(), status: Status.INACTIVE },
      }),
      this.prisma.studentGroup.updateMany({
        where: { groupId: id, status: Status.ACTIVE },
        data: { status: Status.INACTIVE },
      }),
    ]);
    await this.audit.record(actor, 'DELETE', 'group', id, {
      organizationId: row.organizationId,
      branchId: row.branchId,
      changes: { name: row.name },
    });
  }

  async restore(user: RequestUser, actor: V2Actor, id: number): Promise<void> {
    const row = await this.findOwned(user, actor, id, true);

    await this.prisma.group.update({
      where: { id },
      data: { deleted_at: null, status: Status.ACTIVE },
    });
    await this.audit.record(actor, 'UPDATE', 'group', id, {
      organizationId: row.organizationId,
      branchId: row.branchId,
      changes: { restored: true },
    });
  }

  teacherWhere(actor: V2Actor): Prisma.GroupWhereInput {
    return actor.ref.kind === 'teacher' ? { teacherId: actor.ref.id } : {};
  }

  async findOwned(
    user: RequestUser,
    actor: V2Actor,
    id: number,
    includeDeleted = false,
  ): Promise<GroupRow> {
    const org = this.scope.org(user);
    const row = org
      ? await this.prisma.group.findFirst({
          where: {
            id,
            ...org,
            ...this.teacherWhere(actor),
            ...(includeDeleted ? {} : { deleted_at: null }),
          },
          select: GROUP_SELECT,
        })
      : null;

    if (!row) throw new NotFoundException('Guruh topilmadi');
    return row;
  }

  /** `t12` → Teacher.id. `null` — olib tashlash, `undefined` — o'zgarmaydi. */
  private async resolveTeacher(
    value: string | null | undefined,
    organizationId: number,
  ): Promise<number | null | undefined> {
    if (value === undefined) return undefined;
    if (value === null) return null;

    const ref = parseStaffId(value);
    const teacher =
      ref?.kind === 'teacher'
        ? await this.prisma.teacher.findFirst({
            where: {
              id: ref.id,
              organizationId,
              deleted_at: null,
              status: UserStatus.ACTIVE,
            },
            select: { id: true },
          })
        : null;

    if (!teacher) throw new BadRequestException('O‘qituvchi topilmadi');
    return teacher.id;
  }

  toGroup(row: GroupRow) {
    return {
      id: toId(row.id),
      name: row.name,
      branch_id: row.branchId ? toId(row.branchId) : '',
      ...(row.branch ? { branch_name: row.branch.name } : {}),
      course_type: toV2CourseType(row.course?.type ?? row.courseType),
      active_students: row._count.studentGroup,
      is_active: row.status === Status.ACTIVE && !row.deleted_at,
      created_at: row.created_at.toISOString(),
      teacher_id: row.teacherId ? toTeacherId(row.teacherId) : null,
      teacher_name: row.teacher?.fullName ?? null,
      schedule: row.templates.map((template) => ({
        id: toId(template.id),
        day_of_week: template.dayOfWeek,
        start_time: template.startTime,
        end_time: template.endTime,
        lesson_type: template.lessonType as 'theory' | 'practice',
      })),
      students: [] as unknown[],
      deleted_at: row.deleted_at?.toISOString() ?? null,
    };
  }
}

const isOwner = (actor: V2Actor) => actor.role === 'owner' || actor.role === 'dev';
