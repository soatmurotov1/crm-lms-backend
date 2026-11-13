import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Subject } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import type { V2Actor } from '../common/v2-auth.guard';
import { V2AuditService } from '../common/v2-audit.service';
import { pageOf, paginated } from '../common/v2-pagination';
import { optionalId, toId } from '../common/v2.mapper';
import { LmsAccessService } from './lms-access.service';
import type {
  CreateSubjectDto,
  SubjectsQueryDto,
  UpdateSubjectDto,
} from './lms.dto';

type SubjectRow = Subject & {
  parent: { name: string } | null;
  _count: { courses: number; children: number };
};

@Injectable()
export class LmsSubjectsService {
  constructor(
    private prisma: PrismaService,
    private access: LmsAccessService,
    private audit: V2AuditService,
  ) {}

  private readonly include = {
    parent: { select: { name: true } },
    _count: {
      select: {
        courses: { where: { deleted_at: null } },
        children: { where: { deleted_at: null } },
      },
    },
  } as const;

  async list(user: RequestUser, query: SubjectsQueryDto) {
    const { page, limit, skip, take } = pageOf(query, 50);
    const org = this.access.orgWhere(user);
    if (!org) return paginated([], 0, page, limit);

    const parentId = optionalId(query.parent_id);
    const where: Prisma.SubjectWhereInput = {
      ...org,
      deleted_at: null,
      ...(parentId ? { parentId } : {}),
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.subject.count({ where }),
      this.prisma.subject.findMany({
        where,
        include: this.include,
        orderBy: [{ name: query.order ?? 'asc' }],
        skip,
        take,
      }),
    ]);
    return paginated(rows.map(toSubject), total, page, limit);
  }

  async detail(user: RequestUser, id: number) {
    return { data: toSubject(await this.find(user, id)) };
  }

  async create(
    user: RequestUser,
    actor: V2Actor,
    payload: CreateSubjectDto,
    branchId: number | null,
  ) {
    const organizationId = await this.access.writeOrg(user, branchId);
    await this.assertUnique(organizationId, payload.name);
    const parentId = await this.parent(organizationId, payload.parent_id);

    const row = await this.prisma.subject.create({
      data: {
        organizationId,
        name: payload.name,
        description: payload.description || null,
        color: payload.color ?? null,
        parentId,
      },
      include: this.include,
    });
    await this.audit.record(actor, 'CREATE', 'subject', row.id, {
      organizationId,
      changes: { name: row.name },
    });
    return { data: toSubject(row) };
  }

  async update(
    user: RequestUser,
    actor: V2Actor,
    id: number,
    payload: UpdateSubjectDto,
  ) {
    const before = await this.find(user, id);
    if (payload.name && payload.name !== before.name) {
      await this.assertUnique(before.organizationId, payload.name, id);
    }
    let parentId: number | null | undefined;
    if (payload.parent_id !== undefined) {
      parentId = await this.parent(before.organizationId, payload.parent_id);
      if (parentId === id) {
        throw new BadRequestException('Fan o‘ziga kategoriya bo‘la olmaydi');
      }
    }

    const row = await this.prisma.subject.update({
      where: { id },
      data: {
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(payload.description !== undefined
          ? { description: payload.description || null }
          : {}),
        ...(payload.color !== undefined ? { color: payload.color || null } : {}),
        ...(parentId !== undefined ? { parentId } : {}),
      },
      include: this.include,
    });
    await this.audit.record(actor, 'UPDATE', 'subject', id, {
      organizationId: row.organizationId,
      changes: { ...payload },
    });
    return { data: toSubject(row) };
  }

  async remove(user: RequestUser, actor: V2Actor, id: number): Promise<void> {
    const row = await this.find(user, id);
    if (row._count.courses > 0) {
      throw new ConflictException(
        'Bu fanga kurslar biriktirilgan. Avval kurslarni boshqa fanga o‘tkazing',
      );
    }
    await this.prisma.$transaction([
      this.prisma.subject.updateMany({
        where: { parentId: id },
        data: { parentId: null },
      }),
      // Nom bo'shaydi — xuddi shu nomli fanni qayta yaratish mumkin bo'lsin.
      this.prisma.subject.update({
        where: { id },
        data: { deleted_at: new Date(), name: `${row.name}#deleted-${id}` },
      }),
    ]);
    await this.audit.record(actor, 'DELETE', 'subject', id, {
      organizationId: row.organizationId,
      changes: { name: row.name },
    });
  }

  private async find(user: RequestUser, id: number): Promise<SubjectRow> {
    const org = this.access.orgWhere(user);
    const row = org
      ? await this.prisma.subject.findFirst({
          where: { id, ...org, deleted_at: null },
          include: this.include,
        })
      : null;
    if (!row) throw new NotFoundException('Fan topilmadi');
    return row;
  }

  private async assertUnique(organizationId: number, name: string, exceptId?: number) {
    const clash = await this.prisma.subject.findFirst({
      where: {
        organizationId,
        name: { equals: name, mode: 'insensitive' },
        deleted_at: null,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw new ConflictException('Bu nomdagi fan allaqachon mavjud');
  }

  private async parent(organizationId: number, value?: string | null) {
    const id = optionalId(value);
    if (id === undefined) return null;
    if (id === null) throw new BadRequestException('Kategoriya noto‘g‘ri');
    const row = await this.prisma.subject.findFirst({
      where: { id, organizationId, deleted_at: null },
      select: { id: true },
    });
    if (!row) throw new BadRequestException('Kategoriya topilmadi');
    return id;
  }
}

function toSubject(row: SubjectRow) {
  return {
    id: toId(row.id),
    name: row.name,
    description: row.description,
    color: row.color,
    parent_id: row.parentId ? toId(row.parentId) : null,
    parent_name: row.parent?.name ?? null,
    courses_count: row._count.courses,
    children_count: row._count.children,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
