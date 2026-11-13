import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LeadStage,
  Prisma,
  Status,
  type Lead,
  type LeadActivity,
  type LeadStageConfig,
} from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import { hashPassword } from 'src/common/bcrypt/bcrypt';
import { generateRandomPassword } from 'src/common/utils/password.util';
import { CROSS_BRANCH_ROLES, type V2Actor } from '../common/v2-auth.guard';
import { V2AuditService, diff } from '../common/v2-audit.service';
import { ConcurrentUpdateException, uniqueGuard } from '../common/v2-errors';
import { pageOf } from '../common/v2-pagination';
import { V2ScopeService } from '../common/v2-scope.service';
import {
  fromV2CourseType,
  joinName,
  optionalId,
  parseStaffId,
  splitName,
  toId,
  toV2CourseType,
} from '../common/v2.mapper';
import type {
  V2AssignLeadDto,
  V2ConvertLeadDto,
  V2CreateLeadActivityDto,
  V2CreateLeadDto,
  V2CreateLeadSourceDto,
  V2LeadDuplicateQueryDto,
  V2LeadMetricsQueryDto,
  V2LeadStageTransitionDto,
  V2LeadsQueryDto,
  V2UpdateLeadActivityDto,
  V2UpdateLeadDto,
  V2UpdateLeadStagesDto,
} from './v2-leads.dto';

type StageKind = 'NEW' | 'WORK' | 'WON' | 'LOST';

/** Har bir tashkilot uchun boshlang'ich voronka. */
const DEFAULT_STAGES: { name: string; kind: StageKind; color: string; isSystem: boolean }[] = [
  { name: 'Yangi', kind: 'NEW', color: '#3B82F6', isSystem: true },
  { name: "Bog'lanildi", kind: 'WORK', color: '#8B5CF6', isSystem: false },
  { name: 'Sinov darsi', kind: 'WORK', color: '#F59E0B', isSystem: false },
  { name: "O'quvchi bo'ldi", kind: 'WON', color: '#10B981', isSystem: true },
  { name: "Yo'qotildi", kind: 'LOST', color: '#EF4444', isSystem: true },
];

/** Tizim manbalari — frontend ularni tarjima kaliti bilan ko'rsatadi. */
const SYSTEM_SOURCES = [
  'telegram',
  'instagram',
  'referral',
  'directory_map',
  'olx',
  'walk_in',
  'other',
];

const LEGACY_STAGE: Record<StageKind, LeadStage> = {
  NEW: LeadStage.NEW,
  WORK: LeadStage.CONTACTED,
  WON: LeadStage.WON,
  LOST: LeadStage.LOST,
};

const TAB_KINDS: Record<string, StageKind[]> = {
  new: ['NEW'],
  in_progress: ['WORK'],
  won: ['WON'],
  lost: ['LOST'],
};

const PERIOD_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '60d': 60 };

/** Shuncha kundan beri tegilmagan ochiq lid "e'tiborsiz" hisoblanadi. */
const UNTOUCHED_DAYS = 3;
const BOARD_COLUMN_LIMIT = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

const LEAD_INCLUDE = {
  stageConfig: true,
  assignedTo: { select: { id: true, fullName: true } },
} satisfies Prisma.LeadInclude;

type LeadLinks = Partial<
  Record<
    'referrerStudentId' | 'referrerStaffId' | 'desiredGroupId' | 'assignedToId',
    number | null
  >
>;

type LeadRow = Lead & {
  stageConfig: LeadStageConfig | null;
  assignedTo: { id: number; fullName: string } | null;
};

const iso = (value: Date | null | undefined) =>
  value ? value.toISOString() : null;

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

@Injectable()
export class V2LeadsService {
  constructor(
    private prisma: PrismaService,
    private scope: V2ScopeService,
    private audit: V2AuditService,
  ) {}

  // --- Bosqichlar va manbalar -----------------------------------------------

  async stages(user: RequestUser) {
    const organizationId = await this.orgId(user);
    const rows = await this.ensureStages(organizationId);
    return { data: rows.map((row) => this.toStage(row)) };
  }

  async updateStages(
    user: RequestUser,
    actor: V2Actor,
    payload: V2UpdateLeadStagesDto,
  ) {
    const organizationId = await this.orgId(user);
    const current = await this.ensureStages(organizationId);
    const byId = new Map(current.map((row) => [toId(row.id), row]));

    if (!payload.stages.some((stage) => stage.isActive !== false)) {
      throw new BadRequestException('Kamida bitta faol bosqich bo‘lishi kerak');
    }

    const keptIds = new Set(
      payload.stages.map((stage) => stage.id).filter((id): id is string => !!id),
    );
    for (const id of keptIds) {
      if (!byId.has(id)) throw new BadRequestException('Bosqich topilmadi');
    }

    const removed = current.filter(
      (row) => !keptIds.has(toId(row.id)) && !row.isSystem,
    );
    const systemMissing = current.filter(
      (row) => row.isSystem && !keptIds.has(toId(row.id)),
    );
    if (systemMissing.length) {
      throw new BadRequestException('Tizim bosqichlarini o‘chirib bo‘lmaydi');
    }

    let moveTo: number | null = null;
    if (removed.length) {
      const target = payload.moveToStageId
        ? byId.get(payload.moveToStageId)
        : current.find((row) => row.kind === 'NEW');
      if (!target || removed.some((row) => row.id === target.id)) {
        throw new BadRequestException(
          'O‘chirilayotgan bosqichdagi lidlar uchun boshqa bosqich tanlang',
        );
      }
      moveTo = target.id;
    }

    await this.prisma.$transaction(async (tx) => {
      for (const stage of payload.stages) {
        const data = {
          name: stage.name,
          color: stage.color,
          position: stage.position,
          isActive: stage.isActive ?? true,
        };
        if (stage.id) {
          const existing = byId.get(stage.id)!;
          await tx.leadStageConfig.update({
            where: { id: existing.id },
            // Tizim bosqichi o'chirib qo'yilmaydi.
            data: existing.isSystem ? { ...data, isActive: true } : data,
          });
        } else {
          await tx.leadStageConfig.create({
            data: { ...data, organizationId, kind: 'WORK', isSystem: false },
          });
        }
      }
      if (removed.length && moveTo) {
        const target = byId.get(toId(moveTo))!;
        await tx.lead.updateMany({
          where: { stageId: { in: removed.map((row) => row.id) } },
          data: {
            stageId: moveTo,
            stage: LEGACY_STAGE[target.kind as StageKind],
            stageEnteredAt: new Date(),
          },
        });
        await tx.leadStageConfig.deleteMany({
          where: { id: { in: removed.map((row) => row.id) } },
        });
      }
    });

    await this.audit.record(actor, 'UPDATE', 'lead_stages', organizationId, {
      organizationId,
      changes: { stages: payload.stages.map((stage) => stage.name) },
    });

    return this.stages(user);
  }

  async sources(user: RequestUser) {
    const organizationId = await this.orgId(user);
    const rows = await this.ensureSources(organizationId);
    return {
      data: rows.map((row) => ({
        id: toId(row.id),
        name: row.name,
        isSystem: row.isSystem,
        isActive: row.isActive,
        createdAt: row.created_at.toISOString(),
      })),
    };
  }

  async createSource(
    user: RequestUser,
    actor: V2Actor,
    payload: V2CreateLeadSourceDto,
  ) {
    const organizationId = await this.orgId(user);
    await this.ensureSources(organizationId);
    const row = await uniqueGuard(
      () =>
        this.prisma.leadSourceConfig.create({
          data: { organizationId, name: payload.name, isSystem: false },
        }),
      'Bu nomdagi manba allaqachon mavjud',
    );
    await this.audit.record(actor, 'CREATE', 'lead_source', row.id, {
      organizationId,
      changes: { name: row.name },
    });
    return {
      data: {
        id: toId(row.id),
        name: row.name,
        isSystem: false,
        isActive: true,
        createdAt: row.created_at.toISOString(),
      },
    };
  }

  async removeSource(user: RequestUser, actor: V2Actor, id: number) {
    const organizationId = await this.orgId(user);
    const row = await this.prisma.leadSourceConfig.findFirst({
      where: { id, organizationId },
    });
    if (!row) throw new NotFoundException('Manba topilmadi');
    if (row.isSystem) {
      throw new BadRequestException('Tizim manbasini o‘chirib bo‘lmaydi');
    }
    await this.prisma.leadSourceConfig.delete({ where: { id } });
    await this.audit.record(actor, 'DELETE', 'lead_source', id, {
      organizationId,
      changes: { name: row.name },
    });
    return { data: { success: true } };
  }

  // --- Lidlar ---------------------------------------------------------------

  async list(
    user: RequestUser,
    actor: V2Actor,
    query: V2LeadsQueryDto,
    headerBranchId: number | null,
  ) {
    const { page, limit, skip, take } = pageOf(query);
    const where = await this.listWhere(user, actor, query, headerBranchId);
    if (!where) return { data: { items: [], total: 0, page, limit } };

    const [total, rows] = await Promise.all([
      this.prisma.lead.count({ where }),
      this.prisma.lead.findMany({
        where,
        include: LEAD_INCLUDE,
        orderBy: [{ lastTouchAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
    ]);
    const names = await this.names(rows);

    return {
      data: {
        items: rows.map((row) => this.toLead(row, names)),
        total,
        page,
        limit,
      },
    };
  }

  async board(
    user: RequestUser,
    actor: V2Actor,
    query: V2LeadsQueryDto,
    headerBranchId: number | null,
  ) {
    const organizationId = await this.orgId(user);
    const stages = (await this.ensureStages(organizationId)).filter(
      (stage) => stage.isActive,
    );
    const where = await this.listWhere(
      user,
      actor,
      { ...query, stageId: undefined, tab: undefined },
      headerBranchId,
    );

    const columns = await Promise.all(
      stages.map(async (stage) => {
        const stageWhere: Prisma.LeadWhereInput = {
          AND: [where ?? { id: -1 }, { stageId: stage.id }],
        };
        const [total, rows] = await Promise.all([
          this.prisma.lead.count({ where: stageWhere }),
          this.prisma.lead.findMany({
            where: stageWhere,
            include: LEAD_INCLUDE,
            orderBy: [{ lastTouchAt: 'desc' }, { id: 'desc' }],
            take: BOARD_COLUMN_LIMIT,
          }),
        ]);
        return { stage, total, rows };
      }),
    );
    const names = await this.names(columns.flatMap((column) => column.rows));

    return {
      data: columns.map(({ stage, total, rows }) => ({
        stageId: toId(stage.id),
        stageName: stage.name,
        stageColor: stage.color,
        position: stage.position,
        kind: stage.kind,
        isSystem: stage.isSystem,
        isActive: stage.isActive,
        companyId: toId(stage.organizationId),
        createdAt: stage.created_at.toISOString(),
        updatedAt: stage.updated_at.toISOString(),
        total,
        items: rows.map((row) => this.toCard(row, names)),
      })),
    };
  }

  async detail(user: RequestUser, actor: V2Actor, id: number) {
    const row = await this.findOwned(user, actor, id);
    const names = await this.names([row]);
    return { data: this.toLead(row, names) };
  }

  async create(
    user: RequestUser,
    actor: V2Actor,
    payload: V2CreateLeadDto,
    headerBranchId: number | null,
  ) {
    const { branchId, organizationId } = await this.scope.writeBranch(
      user,
      actor,
      headerBranchId,
      payload.branchId,
    );
    const stages = await this.ensureStages(organizationId);
    const stage = payload.stageId
      ? stages.find((row) => toId(row.id) === payload.stageId)
      : stages.find((row) => row.kind === 'NEW');
    if (!stage) throw new BadRequestException('Bosqich topilmadi');

    const links = await this.links(organizationId, payload);
    const now = new Date();
    const row = await this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          organizationId,
          branchId,
          fullName: joinName(payload.firstName, payload.lastName),
          firstName: payload.firstName,
          lastName: payload.lastName || null,
          phone: payload.phone,
          email: payload.email || null,
          courseType: fromV2CourseType(payload.courseType) ?? null,
          direction: payload.direction || null,
          source: payload.source,
          sourceOther: payload.source === 'other' ? payload.sourceOther || null : null,
          ...links,
          stageId: stage.id,
          stage: LEGACY_STAGE[stage.kind as StageKind],
          stageEnteredAt: now,
          lastTouchAt: now,
          marketingConsent: payload.marketingConsent ?? false,
          note: payload.note || null,
          utmSource: payload.utmSource || null,
          utmMedium: payload.utmMedium || null,
          utmCampaign: payload.utmCampaign || null,
          utmContent: payload.utmContent || null,
          utmTerm: payload.utmTerm || null,
          referrer: payload.referrer || null,
          landing: payload.landing || null,
          createdById: actor.ref.kind === 'user' ? actor.ref.id : null,
        },
        include: LEAD_INCLUDE,
      });
      await tx.leadActivity.create({
        data: {
          leadId: lead.id,
          kind: 'SYSTEM',
          body: 'Lid yaratildi',
          authorId: actor.id,
          authorName: actor.name,
        },
      });
      return lead;
    });

    await this.audit.record(actor, 'CREATE', 'lead', row.id, {
      organizationId,
      branchId,
      changes: { name: row.fullName, phone: row.phone },
    });

    const names = await this.names([row]);
    return { data: this.toLead(row, names) };
  }

  async update(
    user: RequestUser,
    actor: V2Actor,
    id: number,
    payload: V2UpdateLeadDto,
  ) {
    const before = await this.findOwned(user, actor, id);
    const organizationId = before.organizationId!;
    const branchId =
      payload.branchId !== undefined
        ? (await this.scope.writeBranch(user, actor, null, payload.branchId))
            .branchId
        : undefined;
    const links = await this.links(organizationId, payload);

    const firstName = payload.firstName ?? before.firstName ?? splitName(before.fullName).first;
    const lastName =
      payload.lastName !== undefined ? payload.lastName || null : before.lastName;

    const row = await this.prisma.lead.update({
      where: { id },
      data: {
        ...(payload.firstName !== undefined || payload.lastName !== undefined
          ? { firstName, lastName, fullName: joinName(firstName, lastName) }
          : {}),
        ...(payload.phone !== undefined ? { phone: payload.phone } : {}),
        ...(payload.email !== undefined ? { email: payload.email || null } : {}),
        ...(branchId !== undefined ? { branchId } : {}),
        ...(payload.courseType !== undefined
          ? { courseType: fromV2CourseType(payload.courseType) ?? null }
          : {}),
        ...(payload.direction !== undefined
          ? { direction: payload.direction || null }
          : {}),
        ...(payload.source !== undefined ? { source: payload.source } : {}),
        ...(payload.sourceOther !== undefined
          ? { sourceOther: payload.sourceOther || null }
          : {}),
        ...links,
        ...(payload.marketingConsent !== undefined
          ? { marketingConsent: payload.marketingConsent }
          : {}),
        ...(payload.note !== undefined ? { note: payload.note || null } : {}),
        lastTouchAt: new Date(),
        version: { increment: 1 },
      },
      include: LEAD_INCLUDE,
    });

    const names = await this.names([before, row]);
    await this.audit.record(actor, 'UPDATE', 'lead', id, {
      organizationId,
      branchId: row.branchId,
      changes: diff(this.toLead(before, names), this.toLead(row, names)),
    });
    return { data: this.toLead(row, names) };
  }

  async remove(user: RequestUser, actor: V2Actor, id: number): Promise<void> {
    const row = await this.findOwned(user, actor, id);
    await this.prisma.lead.update({
      where: { id },
      data: { deleted_at: new Date(), status: Status.INACTIVE },
    });
    await this.audit.record(actor, 'DELETE', 'lead', id, {
      organizationId: row.organizationId,
      branchId: row.branchId,
      changes: { name: row.fullName },
    });
  }

  async transition(
    user: RequestUser,
    actor: V2Actor,
    id: number,
    payload: V2LeadStageTransitionDto,
  ) {
    const before = await this.findOwned(user, actor, id);
    if (payload.version !== undefined && payload.version !== before.version) {
      throw new ConcurrentUpdateException();
    }
    const stages = await this.ensureStages(before.organizationId!);
    const stage = stages.find((row) => toId(row.id) === payload.stageId);
    if (!stage || !stage.isActive) throw new BadRequestException('Bosqich topilmadi');

    const kind = stage.kind as StageKind;
    if (kind === 'LOST' && !payload.lostReason) {
      throw new BadRequestException('Yo‘qotish sababini tanlang');
    }
    if (kind === 'LOST' && payload.lostReason === 'OTHER' && !payload.lostReasonOther) {
      throw new BadRequestException('Sababni yozing');
    }

    const now = new Date();
    const row = await this.prisma.$transaction(async (tx) => {
      const result = await tx.lead.updateMany({
        where: { id, version: before.version },
        data: {
          stageId: stage.id,
          stage: LEGACY_STAGE[kind],
          stageEnteredAt: now,
          lastTouchAt: now,
          lostReason: kind === 'LOST' ? payload.lostReason : null,
          lostReasonOther:
            kind === 'LOST' && payload.lostReason === 'OTHER'
              ? payload.lostReasonOther
              : null,
          version: { increment: 1 },
        },
      });
      if (result.count === 0) throw new ConcurrentUpdateException();
      await tx.leadActivity.create({
        data: {
          leadId: id,
          kind: 'STAGE_CHANGE',
          body: `${before.stageConfig?.name ?? '—'} → ${stage.name}`,
          authorId: actor.id,
          authorName: actor.name,
          meta: {
            fromStageId: before.stageId ? toId(before.stageId) : null,
            toStageId: toId(stage.id),
            ...(payload.lostReason ? { lostReason: payload.lostReason } : {}),
          },
        },
      });
      return tx.lead.findUniqueOrThrow({ where: { id }, include: LEAD_INCLUDE });
    });

    await this.audit.record(actor, 'UPDATE', 'lead', id, {
      organizationId: row.organizationId,
      branchId: row.branchId,
      changes: { stage: { from: before.stageConfig?.name ?? null, to: stage.name } },
    });
    const names = await this.names([row]);
    return { data: this.toLead(row, names) };
  }

  async assign(
    user: RequestUser,
    actor: V2Actor,
    id: number,
    payload: V2AssignLeadDto,
  ) {
    const before = await this.findOwned(user, actor, id);
    const assignedToId = await this.assigneeId(
      before.organizationId!,
      payload.assigneeUserId,
    );
    const row = await this.prisma.lead.update({
      where: { id },
      data: { assignedToId, lastTouchAt: new Date(), version: { increment: 1 } },
      include: LEAD_INCLUDE,
    });
    await this.prisma.leadActivity.create({
      data: {
        leadId: id,
        kind: 'SYSTEM',
        body: row.assignedTo
          ? `Mas'ul: ${row.assignedTo.fullName}`
          : "Mas'ul olib tashlandi",
        authorId: actor.id,
        authorName: actor.name,
      },
    });
    await this.audit.record(actor, 'UPDATE', 'lead', id, {
      organizationId: row.organizationId,
      branchId: row.branchId,
      changes: {
        assignee: {
          from: before.assignedTo?.fullName ?? null,
          to: row.assignedTo?.fullName ?? null,
        },
      },
    });
    const names = await this.names([row]);
    return { data: this.toLead(row, names) };
  }

  /** Lidni o'quvchiga aylantirish: o'quvchi yaratiladi, lid "yutildi" bosqichiga o'tadi. */
  async convert(
    user: RequestUser,
    actor: V2Actor,
    id: number,
    payload: V2ConvertLeadDto,
  ) {
    const lead = await this.findOwned(user, actor, id);
    if (lead.studentId) {
      throw new ConflictException('Lid allaqachon o‘quvchiga aylantirilgan');
    }

    const duplicate = await this.prisma.student.findUnique({
      where: { phone: lead.phone },
      select: { id: true, fullName: true, organizationId: true, deleted_at: true },
    });
    if (duplicate && !payload.force) {
      throw new ConflictException({
        message: `Ushbu telefon raqamli o‘quvchi allaqachon mavjud: ${duplicate.fullName}`,
        details: { reason: 'duplicate_student', studentId: toId(duplicate.id) },
      });
    }
    if (duplicate && duplicate.organizationId !== lead.organizationId) {
      throw new ConflictException('Bu telefon raqami boshqa tashkilotda band');
    }

    const stages = await this.ensureStages(lead.organizationId!);
    const won = stages.find((stage) => stage.kind === 'WON');
    const now = new Date();
    const name = {
      first: lead.firstName ?? splitName(lead.fullName).first,
      last: lead.lastName ?? splitName(lead.fullName).last,
    };

    const studentId = await this.prisma.$transaction(async (tx) => {
      const student =
        duplicate ??
        (await tx.student.create({
          data: {
            fullName: joinName(name.first, name.last),
            firstName: name.first,
            lastName: name.last || null,
            phone: lead.phone,
            email: lead.email,
            password: await hashPassword(generateRandomPassword(16)),
            organizationId: lead.organizationId,
            branchId: lead.branchId,
            courseType: lead.courseType,
            leadSource: lead.source,
            leadSourceOther: lead.sourceOther,
            referredByStudentId: lead.referrerStudentId,
            notes: lead.note,
            startDate: now,
            registeredById: actor.ref.kind === 'user' ? actor.ref.id : null,
          },
          select: { id: true },
        }));

      if (lead.desiredGroupId) {
        const group = await tx.group.findFirst({
          where: { id: lead.desiredGroupId, organizationId: lead.organizationId },
          select: { id: true },
        });
        const already = await tx.studentGroup.findFirst({
          where: { studentId: student.id, groupId: lead.desiredGroupId },
          select: { id: true },
        });
        if (group && !already) {
          await tx.studentGroup.create({
            data: { studentId: student.id, groupId: group.id },
          });
        }
      }

      await tx.lead.update({
        where: { id },
        data: {
          studentId: student.id,
          convertedAt: now,
          lastTouchAt: now,
          ...(won
            ? { stageId: won.id, stage: LeadStage.WON, stageEnteredAt: now }
            : {}),
          version: { increment: 1 },
        },
      });
      await tx.leadActivity.create({
        data: {
          leadId: id,
          kind: 'SYSTEM',
          body: "O'quvchiga aylantirildi",
          authorId: actor.id,
          authorName: actor.name,
          meta: { studentId: toId(student.id) },
        },
      });
      return student.id;
    });

    await this.audit.record(actor, 'UPDATE', 'lead', id, {
      organizationId: lead.organizationId,
      branchId: lead.branchId,
      changes: { converted_to_student: toId(studentId) },
    });

    return {
      data: {
        studentId: toId(studentId),
        student: {
          id: toId(studentId),
          first_name: name.first,
          last_name: name.last,
          phone: lead.phone,
        },
      },
    };
  }

  async checkDuplicate(
    user: RequestUser,
    actor: V2Actor,
    query: V2LeadDuplicateQueryDto,
  ) {
    const org = this.scope.org(user);
    if (!org) return { data: { openLeads: [], students: [] } };

    const exclude = optionalId(query.excludeLeadId);
    const [leads, students] = await Promise.all([
      this.prisma.lead.findMany({
        where: {
          ...org,
          deleted_at: null,
          phone: query.phone,
          studentId: null,
          ...(exclude ? { id: { not: exclude } } : {}),
          stageConfig: { kind: { notIn: ['WON', 'LOST'] } },
        },
        include: { stageConfig: true },
        take: 5,
      }),
      this.prisma.student.findMany({
        where: { ...org, deleted_at: null, phone: query.phone },
        select: {
          id: true,
          fullName: true,
          firstName: true,
          lastName: true,
          lifecycle: true,
          branchId: true,
        },
        take: 5,
      }),
    ]);
    const branchNames = await this.branchNames([
      ...leads.map((row) => row.branchId),
      ...students.map((row) => row.branchId),
    ]);

    return {
      data: {
        openLeads: leads.map((row) => ({
          id: toId(row.id),
          firstName: row.firstName ?? splitName(row.fullName).first,
          lastName: row.lastName ?? null,
          stageName: row.stageConfig?.name ?? '',
          branchName: row.branchId ? branchNames.get(row.branchId) : undefined,
        })),
        students: students.map((row) => ({
          id: toId(row.id),
          firstName: row.firstName ?? splitName(row.fullName).first,
          lastName: row.lastName ?? splitName(row.fullName).last,
          status: row.lifecycle,
          branchName: row.branchId ? branchNames.get(row.branchId) : undefined,
        })),
      },
    };
  }

  async metrics(
    user: RequestUser,
    actor: V2Actor,
    query: V2LeadMetricsQueryDto,
    headerBranchId: number | null,
  ) {
    const organizationId = await this.orgId(user);
    const stages = await this.ensureStages(organizationId);
    const where = await this.listWhere(
      user,
      actor,
      { branchId: query.branchId, period: query.period },
      headerBranchId,
    );
    const rows = where
      ? await this.prisma.lead.findMany({
          where,
          select: {
            id: true,
            stageId: true,
            source: true,
            lostReason: true,
            studentId: true,
            created_at: true,
            convertedAt: true,
            nextContactAt: true,
            lastTouchAt: true,
          },
        })
      : [];

    const kindOf = new Map(stages.map((stage) => [stage.id, stage.kind as StageKind]));
    const now = Date.now();
    const isOpen = (stageId: number | null) => {
      const kind = stageId ? kindOf.get(stageId) : 'NEW';
      return kind !== 'WON' && kind !== 'LOST';
    };

    const perStage = new Map<number, number>();
    const bySource: Record<string, { count: number; won: number; conversionRate: number }> = {};
    const lost = new Map<string, number>();
    let converted = 0;
    let overdue = 0;
    let untouched = 0;
    const wonDays: number[] = [];

    for (const row of rows) {
      if (row.stageId) perStage.set(row.stageId, (perStage.get(row.stageId) ?? 0) + 1);
      const source = row.source ?? 'other';
      bySource[source] ??= { count: 0, won: 0, conversionRate: 0 };
      bySource[source].count += 1;
      if (row.studentId) {
        converted += 1;
        bySource[source].won += 1;
        if (row.convertedAt) {
          wonDays.push((row.convertedAt.getTime() - row.created_at.getTime()) / DAY_MS);
        }
      }
      if (row.lostReason && row.stageId && kindOf.get(row.stageId) === 'LOST') {
        lost.set(row.lostReason, (lost.get(row.lostReason) ?? 0) + 1);
      }
      if (isOpen(row.stageId)) {
        if (row.nextContactAt && row.nextContactAt.getTime() < now) overdue += 1;
        if (now - row.lastTouchAt.getTime() > UNTOUCHED_DAYS * DAY_MS) untouched += 1;
      }
    }
    for (const value of Object.values(bySource)) {
      value.conversionRate = value.count
        ? Math.round((value.won / value.count) * 1000) / 10
        : 0;
    }

    const ordered = [...stages].filter((stage) => stage.isActive);
    return {
      data: {
        openPerStage: ordered
          .filter((stage) => stage.kind !== 'WON' && stage.kind !== 'LOST')
          .map((stage) => ({
            stageId: toId(stage.id),
            stageName: stage.name,
            count: perStage.get(stage.id) ?? 0,
          })),
        funnelStages: ordered.map((stage) => ({
          stageId: toId(stage.id),
          stageName: stage.name,
          count: perStage.get(stage.id) ?? 0,
        })),
        leadToStudent: rows.length
          ? Math.round((converted / rows.length) * 1000) / 10
          : 0,
        overdueCount: overdue,
        untouchedCount: untouched,
        lostByReason: [...lost.entries()].map(([reason, count]) => ({ reason, count })),
        totalCreated: rows.length,
        totalConverted: converted,
        lostLeads: [...lost.values()].reduce((sum, value) => sum + value, 0),
        avgTimeToWonDays: wonDays.length
          ? Math.round((wonDays.reduce((a, b) => a + b, 0) / wonDays.length) * 10) / 10
          : null,
        bySource,
      },
    };
  }

  async exportCsv(
    user: RequestUser,
    actor: V2Actor,
    query: V2LeadsQueryDto,
    headerBranchId: number | null,
  ): Promise<string> {
    const where = await this.listWhere(user, actor, query, headerBranchId);
    const rows = where
      ? await this.prisma.lead.findMany({
          where,
          include: LEAD_INCLUDE,
          orderBy: { created_at: 'desc' },
          take: 5000,
        })
      : [];
    const branches = await this.branchNames(rows.map((row) => row.branchId));
    const header = [
      'ID',
      'Ism',
      'Familiya',
      'Telefon',
      'Filial',
      'Bosqich',
      'Manba',
      "Yo'nalish",
      'Kurs turi',
      "Mas'ul",
      'Yaratilgan',
    ];
    const lines = rows.map((row) =>
      [
        row.id,
        row.firstName ?? splitName(row.fullName).first,
        row.lastName ?? '',
        row.phone,
        row.branchId ? (branches.get(row.branchId) ?? '') : '',
        row.stageConfig?.name ?? '',
        row.source === 'other' && row.sourceOther ? row.sourceOther : (row.source ?? ''),
        row.direction ?? '',
        row.courseType ? toV2CourseType(row.courseType) : '',
        row.assignedTo?.fullName ?? '',
        row.created_at.toISOString().slice(0, 10),
      ]
        .map(csvCell)
        .join(','),
    );
    return `﻿${[header.join(','), ...lines].join('\n')}\n`;
  }

  // --- Faoliyat (activity) --------------------------------------------------

  async activities(user: RequestUser, actor: V2Actor, leadId: number) {
    const lead = await this.findOwned(user, actor, leadId);
    const rows = await this.prisma.leadActivity.findMany({
      where: { leadId },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    });
    return { data: rows.map((row) => this.toActivity(row, lead)) };
  }

  async createActivity(
    user: RequestUser,
    actor: V2Actor,
    leadId: number,
    payload: V2CreateLeadActivityDto,
  ) {
    const lead = await this.findOwned(user, actor, leadId);
    if (payload.kind === 'STAGE_CHANGE' || payload.kind === 'SYSTEM') {
      throw new BadRequestException('Bu turdagi yozuvni qo‘lda qo‘shib bo‘lmaydi');
    }
    if (payload.kind !== 'TASK' && !payload.body) {
      throw new BadRequestException('Matnni kiriting');
    }
    if (payload.kind === 'TASK' && !payload.dueAt) {
      throw new BadRequestException('Vazifa muddatini tanlang');
    }

    const row = await this.prisma.leadActivity.create({
      data: {
        leadId,
        kind: payload.kind,
        body: payload.body || null,
        dueAt: payload.kind === 'TASK' && payload.dueAt ? new Date(payload.dueAt) : null,
        authorId: actor.id,
        authorName: actor.name,
        meta: (payload.meta ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    await this.touch(leadId);
    return { data: this.toActivity(row, lead) };
  }

  async updateActivity(
    user: RequestUser,
    actor: V2Actor,
    leadId: number,
    activityId: number,
    payload: V2UpdateLeadActivityDto,
  ) {
    const lead = await this.findOwned(user, actor, leadId);
    const existing = await this.prisma.leadActivity.findFirst({
      where: { id: activityId, leadId },
    });
    if (!existing) throw new NotFoundException('Yozuv topilmadi');
    if (existing.kind === 'STAGE_CHANGE' || existing.kind === 'SYSTEM') {
      throw new BadRequestException('Tizim yozuvini o‘zgartirib bo‘lmaydi');
    }

    const row = await this.prisma.leadActivity.update({
      where: { id: activityId },
      data: {
        ...(payload.body !== undefined ? { body: payload.body || null } : {}),
        ...(payload.doneAt !== undefined
          ? { doneAt: payload.doneAt ? new Date(payload.doneAt) : null }
          : {}),
      },
    });
    await this.touch(leadId);
    return { data: this.toActivity(row, lead) };
  }

  async removeActivity(
    user: RequestUser,
    actor: V2Actor,
    leadId: number,
    activityId: number,
  ): Promise<void> {
    await this.findOwned(user, actor, leadId);
    const existing = await this.prisma.leadActivity.findFirst({
      where: { id: activityId, leadId },
    });
    if (!existing) throw new NotFoundException('Yozuv topilmadi');
    if (existing.kind === 'STAGE_CHANGE' || existing.kind === 'SYSTEM') {
      throw new BadRequestException('Tizim yozuvini o‘chirib bo‘lmaydi');
    }
    await this.prisma.leadActivity.delete({ where: { id: activityId } });
    await this.touch(leadId);
  }

  // --- Yordamchilar ---------------------------------------------------------

  private async orgId(user: RequestUser): Promise<number> {
    return this.scope.writeOrg(user);
  }

  private async ensureStages(organizationId: number): Promise<LeadStageConfig[]> {
    const existing = await this.prisma.leadStageConfig.findMany({
      where: { organizationId },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
    if (existing.length) return existing;

    await this.prisma.leadStageConfig.createMany({
      data: DEFAULT_STAGES.map((stage, index) => ({
        ...stage,
        organizationId,
        position: index,
      })),
    });
    const created = await this.prisma.leadStageConfig.findMany({
      where: { organizationId },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
    // Bosqichsiz eski lidlar "Yangi" bosqichiga tushadi.
    const first = created.find((stage) => stage.kind === 'NEW');
    if (first) {
      await this.prisma.lead.updateMany({
        where: { organizationId, stageId: null },
        data: { stageId: first.id },
      });
    }
    return created;
  }

  private async ensureSources(organizationId: number) {
    await this.prisma.leadSourceConfig.createMany({
      data: SYSTEM_SOURCES.map((name) => ({ organizationId, name, isSystem: true })),
      skipDuplicates: true,
    });
    return this.prisma.leadSourceConfig.findMany({
      where: { organizationId },
      orderBy: [{ isSystem: 'desc' }, { created_at: 'asc' }],
    });
  }

  private async listWhere(
    user: RequestUser,
    actor: V2Actor,
    query: Partial<V2LeadsQueryDto>,
    headerBranchId: number | null,
  ): Promise<Prisma.LeadWhereInput | null> {
    const { org, branchId } = await this.scope.read(
      user,
      actor,
      headerBranchId,
      query.branchId,
    );
    if (!org) return null;

    const and: Prisma.LeadWhereInput[] = [{ ...org, deleted_at: null }];
    if (branchId) and.push({ branchId });

    const stageId = optionalId(query.stageId);
    if (stageId) and.push({ stageId });
    if (query.tab && query.tab !== 'all') {
      and.push({ stageConfig: { kind: { in: TAB_KINDS[query.tab] } } });
    }
    if (query.source) and.push({ source: query.source });
    if (query.courseType) {
      and.push({ courseType: fromV2CourseType(query.courseType) });
    }
    if (query.direction) {
      and.push({ direction: { contains: query.direction, mode: 'insensitive' } });
    }
    if (query.mine) {
      and.push({
        assignedToId: actor.ref.kind === 'user' ? actor.ref.id : -1,
      });
    } else if (query.assigneeId) {
      const ref = parseStaffId(query.assigneeId);
      and.push({ assignedToId: ref?.kind === 'user' ? ref.id : -1 });
    }
    if (query.overdueOnly) {
      and.push({
        nextContactAt: { lt: new Date() },
        stageConfig: { kind: { notIn: ['WON', 'LOST'] } },
      });
    }
    if (query.period && query.period !== 'all') {
      and.push({
        created_at: { gte: new Date(Date.now() - PERIOD_DAYS[query.period] * DAY_MS) },
      });
    }
    if (query.q) {
      const digits = query.q.replace(/\D/g, '');
      and.push({
        OR: [
          { fullName: { contains: query.q, mode: 'insensitive' } },
          { direction: { contains: query.q, mode: 'insensitive' } },
          ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
        ],
      });
    }

    return { AND: and };
  }

  private async findOwned(
    user: RequestUser,
    actor: V2Actor,
    id: number,
  ): Promise<LeadRow> {
    const org = this.scope.org(user);
    const row = org
      ? await this.prisma.lead.findFirst({
          where: {
            id,
            ...org,
            deleted_at: null,
            ...(CROSS_BRANCH_ROLES.includes(actor.role) || !actor.homeBranchId
              ? {}
              : { branchId: actor.homeBranchId }),
          },
          include: LEAD_INCLUDE,
        })
      : null;
    if (!row) throw new NotFoundException('Lid topilmadi');
    if (!row.stageId) {
      await this.ensureStages(row.organizationId!);
      return this.prisma.lead.findUniqueOrThrow({ where: { id }, include: LEAD_INCLUDE });
    }
    return row;
  }

  /** Bog'langan yozuvlar (o'quvchi, xodim, guruh, mas'ul) tashkilotga tegishlimi. */
  private async links(
    organizationId: number,
    payload: Partial<V2CreateLeadDto>,
  ): Promise<LeadLinks> {
    const result: LeadLinks = {};

    if (payload.referrerStudentId !== undefined) {
      const id = optionalId(payload.referrerStudentId);
      if (id) {
        const found = await this.prisma.student.findFirst({
          where: { id, organizationId },
          select: { id: true },
        });
        if (!found) throw new BadRequestException('Tavsiya qilgan o‘quvchi topilmadi');
      }
      result.referrerStudentId = id ?? null;
    }
    if (payload.referrerStaffId !== undefined) {
      const ref = parseStaffId(payload.referrerStaffId);
      result.referrerStaffId = ref?.kind === 'user' ? ref.id : null;
    }
    if (payload.desiredGroupId !== undefined) {
      const id = optionalId(payload.desiredGroupId);
      if (id) {
        const found = await this.prisma.group.findFirst({
          where: { id, organizationId, deleted_at: null },
          select: { id: true },
        });
        if (!found) throw new BadRequestException('Guruh topilmadi');
      }
      result.desiredGroupId = id ?? null;
    }
    if (payload.assigneeUserId !== undefined) {
      result.assignedToId = await this.assigneeId(organizationId, payload.assigneeUserId);
    }

    return result;
  }

  private async assigneeId(
    organizationId: number,
    value: string | null | undefined,
  ): Promise<number | null> {
    if (!value) return null;
    const ref = parseStaffId(value);
    if (!ref || ref.kind !== 'user') {
      throw new BadRequestException('Mas’ul sifatida faqat xodimni tanlash mumkin');
    }
    const found = await this.prisma.user.findFirst({
      where: { id: ref.id, organizationId, deleted_at: null },
      select: { id: true },
    });
    if (!found) throw new BadRequestException('Xodim topilmadi');
    return found.id;
  }

  /** Oxirgi tegish vaqti va eng yaqin ochiq vazifa muddati. */
  private async touch(leadId: number) {
    const task = await this.prisma.leadActivity.findFirst({
      where: { leadId, kind: 'TASK', doneAt: null, dueAt: { not: null } },
      orderBy: { dueAt: 'asc' },
      select: { dueAt: true },
    });
    await this.prisma.lead.update({
      where: { id: leadId },
      data: { lastTouchAt: new Date(), nextContactAt: task?.dueAt ?? null },
    });
  }

  private async branchNames(ids: (number | null)[]) {
    const unique = [...new Set(ids.filter((id): id is number => !!id))];
    const rows = unique.length
      ? await this.prisma.branch.findMany({
          where: { id: { in: unique } },
          select: { id: true, name: true },
        })
      : [];
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  private async names(rows: Lead[]) {
    const [branches, students, staff, groups] = await Promise.all([
      this.branchNames(rows.map((row) => row.branchId)),
      this.lookup('student', rows.map((row) => row.referrerStudentId)),
      this.lookup('user', rows.map((row) => row.referrerStaffId)),
      this.lookup('group', rows.map((row) => row.desiredGroupId)),
    ]);
    return { branches, students, staff, groups };
  }

  private async lookup(kind: 'student' | 'user' | 'group', ids: (number | null)[]) {
    const unique = [...new Set(ids.filter((id): id is number => !!id))];
    if (!unique.length) return new Map<number, string>();
    const where = { id: { in: unique } };
    const rows =
      kind === 'student'
        ? await this.prisma.student.findMany({ where, select: { id: true, fullName: true } })
        : kind === 'user'
          ? await this.prisma.user.findMany({ where, select: { id: true, fullName: true } })
          : (
              await this.prisma.group.findMany({ where, select: { id: true, name: true } })
            ).map((row) => ({ id: row.id, fullName: row.name }));
    return new Map(rows.map((row) => [row.id, row.fullName]));
  }

  private toStage(row: LeadStageConfig) {
    return {
      id: toId(row.id),
      companyId: toId(row.organizationId),
      name: row.name,
      kind: row.kind,
      position: row.position,
      color: row.color,
      isSystem: row.isSystem,
      isActive: row.isActive,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private toCard(row: LeadRow, names: Awaited<ReturnType<V2LeadsService['names']>>) {
    return {
      id: toId(row.id),
      firstName: row.firstName ?? splitName(row.fullName).first,
      lastName: row.lastName ?? null,
      phone: row.phone,
      branchId: row.branchId ? toId(row.branchId) : '',
      branchName: row.branchId ? names.branches.get(row.branchId) : undefined,
      source: row.source ?? 'other',
      direction: row.direction,
      assigneeUserId: row.assignedToId ? toId(row.assignedToId) : null,
      assigneeName: row.assignedTo?.fullName ?? null,
      stageId: row.stageId ? toId(row.stageId) : '',
      nextStepAt: iso(row.nextContactAt),
      lastTouchAt: row.lastTouchAt.toISOString(),
      version: row.version,
      createdAt: row.created_at.toISOString(),
      isOverdue: !!row.nextContactAt && row.nextContactAt.getTime() < Date.now(),
    };
  }

  private toLead(row: LeadRow, names: Awaited<ReturnType<V2LeadsService['names']>>) {
    return {
      id: toId(row.id),
      companyId: row.organizationId ? toId(row.organizationId) : '',
      branchId: row.branchId ? toId(row.branchId) : '',
      branchName: row.branchId ? names.branches.get(row.branchId) : undefined,
      firstName: row.firstName ?? splitName(row.fullName).first,
      lastName: row.lastName ?? null,
      phone: row.phone,
      email: row.email,
      courseType: row.courseType ? toV2CourseType(row.courseType) : null,
      direction: row.direction,
      source: row.source ?? 'other',
      sourceOther: row.sourceOther,
      referrerStudentId: row.referrerStudentId ? toId(row.referrerStudentId) : null,
      referrerStudentName: row.referrerStudentId
        ? (names.students.get(row.referrerStudentId) ?? null)
        : null,
      referrerStaffId: row.referrerStaffId ? toId(row.referrerStaffId) : null,
      referrerStaffName: row.referrerStaffId
        ? (names.staff.get(row.referrerStaffId) ?? null)
        : null,
      desiredGroupId: row.desiredGroupId ? toId(row.desiredGroupId) : null,
      desiredGroupName: row.desiredGroupId
        ? (names.groups.get(row.desiredGroupId) ?? null)
        : null,
      assigneeUserId: row.assignedToId ? toId(row.assignedToId) : null,
      assigneeName: row.assignedTo?.fullName ?? null,
      stageId: row.stageId ? toId(row.stageId) : '',
      ...(row.stageConfig ? { stage: this.toStage(row.stageConfig) } : {}),
      stageEnteredAt: row.stageEnteredAt.toISOString(),
      nextStepAt: iso(row.nextContactAt),
      lastTouchAt: row.lastTouchAt.toISOString(),
      marketingConsent: row.marketingConsent,
      note: row.note,
      lostReason: row.lostReason,
      lostReasonOther: row.lostReasonOther,
      studentId: row.studentId ? toId(row.studentId) : null,
      convertedAt: iso(row.convertedAt),
      utmSource: row.utmSource,
      utmMedium: row.utmMedium,
      utmCampaign: row.utmCampaign,
      utmContent: row.utmContent,
      utmTerm: row.utmTerm,
      referrer: row.referrer,
      landing: row.landing,
      version: row.version,
      createdBy: row.createdById ? toId(row.createdById) : null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private toActivity(row: LeadActivity, lead: Lead) {
    return {
      id: toId(row.id),
      companyId: lead.organizationId ? toId(lead.organizationId) : '',
      branchId: lead.branchId ? toId(lead.branchId) : '',
      leadId: toId(row.leadId),
      kind: row.kind,
      body: row.body,
      dueAt: iso(row.dueAt),
      doneAt: iso(row.doneAt),
      authorUserId: row.authorId,
      authorName: row.authorName,
      meta: (row.meta as Record<string, unknown> | null) ?? null,
      createdAt: row.created_at.toISOString(),
    };
  }
}

