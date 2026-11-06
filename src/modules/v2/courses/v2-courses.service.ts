import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Status } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import type { V2Actor } from '../common/v2-auth.guard';
import { V2AuditService, diff } from '../common/v2-audit.service';
import { uniqueGuard } from '../common/v2-errors';
import { V2ScopeService } from '../common/v2-scope.service';
import {
  fromV2CourseType,
  toId,
  toV2CourseType,
} from '../common/v2.mapper';
import type {
  V2CoursesQueryDto,
  V2CreateCourseDto,
  V2UpdateCourseDto,
} from './v2-courses.dto';

const COURSE_SELECT = {
  id: true,
  name: true,
  type: true,
  price: true,
  durationDays: true,
  durationMonth: true,
  status: true,
  branchId: true,
  organizationId: true,
  deleted_at: true,
  created_at: true,
  branch: { select: { name: true } },
} satisfies Prisma.CourseSelect;

type CourseRow = Prisma.CourseGetPayload<{ select: typeof COURSE_SELECT }>;

const DUPLICATE = 'Bu nomdagi kurs allaqachon mavjud';

@Injectable()
export class V2CoursesService {
  constructor(
    private prisma: PrismaService,
    private scope: V2ScopeService,
    private audit: V2AuditService,
  ) {}

  async list(
    user: RequestUser,
    actor: V2Actor,
    query: V2CoursesQueryDto,
    headerBranchId: number | null,
  ) {
    const { org, branchId } = await this.scope.read(
      user,
      actor,
      headerBranchId,
      query.branch_id,
    );
    if (!org) return { data: [] };

    const type = fromV2CourseType(query.course_type);
    const rows = await this.prisma.course.findMany({
      where: {
        ...org,
        deleted_at: null,
        // Filialsiz (eski) kurs hamma filialda ko'rinadi.
        ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : {}),
        ...(type ? { type } : {}),
        ...(query.search
          ? { name: { contains: query.search, mode: 'insensitive' } }
          : {}),
      },
      select: COURSE_SELECT,
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });

    return { data: rows.map((row) => this.toCourse(row)) };
  }

  async detail(user: RequestUser, id: number) {
    return { data: this.toCourse(await this.findOwned(user, id)) };
  }

  async create(
    user: RequestUser,
    actor: V2Actor,
    payload: V2CreateCourseDto,
    headerBranchId: number | null,
  ) {
    const { branchId, organizationId } = await this.scope.writeBranch(
      user,
      actor,
      headerBranchId,
      payload.branch_id,
    );

    const row = await uniqueGuard(
      () =>
        this.prisma.course.create({
          data: {
            name: payload.name,
            type: fromV2CourseType(payload.course_type),
            price: payload.price,
            durationDays: payload.duration_days,
            durationMonth: Math.max(1, Math.ceil(payload.duration_days / 30)),
            durationLesson: 0,
            organizationId,
            branchId,
          },
          select: COURSE_SELECT,
        }),
      DUPLICATE,
    );

    await this.audit.record(actor, 'CREATE', 'course', row.id, {
      organizationId,
      branchId,
      changes: { name: row.name, price: payload.price },
    });

    return { data: this.toCourse(row) };
  }

  async update(
    user: RequestUser,
    actor: V2Actor,
    id: number,
    payload: V2UpdateCourseDto,
  ) {
    const before = await this.findOwned(user, id);
    const branchId =
      payload.branch_id !== undefined
        ? await this.scope.optionalBranch(user, payload.branch_id)
        : undefined;

    const row = await uniqueGuard(
      () =>
        this.prisma.course.update({
          where: { id },
          data: {
            ...(payload.name !== undefined ? { name: payload.name } : {}),
            ...(payload.price !== undefined ? { price: payload.price } : {}),
            ...(payload.course_type
              ? { type: fromV2CourseType(payload.course_type) }
              : {}),
            ...(payload.duration_days !== undefined
              ? {
                  durationDays: payload.duration_days,
                  durationMonth: Math.max(
                    1,
                    Math.ceil(payload.duration_days / 30),
                  ),
                }
              : {}),
            ...(branchId !== undefined ? { branchId } : {}),
          },
          select: COURSE_SELECT,
        }),
      DUPLICATE,
    );

    await this.audit.record(actor, 'UPDATE', 'course', id, {
      organizationId: row.organizationId,
      branchId: row.branchId,
      changes: diff(this.toCourse(before), this.toCourse(row)),
    });

    return { data: this.toCourse(row) };
  }

  /** Kurs o'chirilmaydi — yashiriladi: unga bog'langan o'quvchilar qoladi. */
  async remove(user: RequestUser, actor: V2Actor, id: number): Promise<void> {
    const row = await this.findOwned(user, id);

    await this.prisma.course.update({
      where: { id },
      data: { deleted_at: new Date(), status: Status.INACTIVE },
    });
    await this.audit.record(actor, 'DELETE', 'course', id, {
      organizationId: row.organizationId,
      branchId: row.branchId,
      changes: { name: row.name },
    });
  }

  private async findOwned(user: RequestUser, id: number): Promise<CourseRow> {
    const org = this.scope.org(user);
    const row = org
      ? await this.prisma.course.findFirst({
          where: { id, ...org, deleted_at: null },
          select: COURSE_SELECT,
        })
      : null;

    if (!row) throw new NotFoundException('Kurs topilmadi');
    return row;
  }

  toCourse(row: CourseRow) {
    return {
      id: toId(row.id),
      name: row.name,
      branch_id: row.branchId ? toId(row.branchId) : '',
      ...(row.branch ? { branch_name: row.branch.name } : {}),
      course_type: toV2CourseType(row.type),
      price: row.price.toNumber(),
      duration_days: row.durationDays ?? row.durationMonth * 30,
      is_active: row.status === Status.ACTIVE && !row.deleted_at,
      created_at: row.created_at.toISOString(),
    };
  }
}
