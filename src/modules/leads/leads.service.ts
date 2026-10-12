import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LeadStage, Prisma, Status } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import {
  orgFilter,
  resolveOwnerOrganizationId,
} from 'src/common/utils/org-scope.util';
import {
  buildPaginatedResult,
  resolvePagination,
} from 'src/common/utils/pagination.util';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { LeadQueryDto } from './dto/lead-query.dto';

/** Yopilgan bosqichlar: bularda "kechikkan bog'lanish" degan tushuncha yo'q. */
const CLOSED_STAGES: LeadStage[] = [LeadStage.WON, LeadStage.LOST];

const leadInclude = {
  course: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, fullName: true } },
} satisfies Prisma.LeadInclude;

@Injectable()
export class LeadsService {
  constructor(private prisma: PrismaService) {}

  async getAll(user: RequestUser, query: LeadQueryDto) {
    const { take, skip } = resolvePagination(query);

    const where: Prisma.LeadWhereInput = {
      status: Status.ACTIVE,
      ...orgFilter(user),
      ...(query.stage ? { stage: query.stage } : {}),
      ...(query.mine ? { assignedToId: user.id } : {}),
      ...(query.overdue
        ? {
            nextContactAt: { lt: new Date() },
            stage: { notIn: CLOSED_STAGES },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [leads, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        include: leadInclude,
        orderBy: { id: 'desc' },
        take,
        skip,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return buildPaginatedResult(leads, total, query, 'leads/all');
  }

  /** Voronka tahlili: har bosqichda nechta lid borligi va konversiya. */
  async getSummary(user: RequestUser) {
    const where = { status: Status.ACTIVE, ...orgFilter(user) };

    const [grouped, overdue] = await this.prisma.$transaction([
      this.prisma.lead.groupBy({
        by: ['stage'],
        where,
        orderBy: { stage: 'asc' },
        _count: { _all: true },
      }),
      this.prisma.lead.count({
        where: {
          ...where,
          nextContactAt: { lt: new Date() },
          stage: { notIn: CLOSED_STAGES },
        },
      }),
    ]);

    const byStage = Object.fromEntries(
      Object.values(LeadStage).map((stage) => [stage, 0]),
    ) as Record<LeadStage, number>;

    for (const row of grouped) {
      const count = row._count as { _all?: number } | undefined;
      byStage[row.stage] = count?._all ?? 0;
    }

    const total = Object.values(byStage).reduce((sum, n) => sum + n, 0);

    return {
      success: true,
      data: {
        total,
        overdue,
        byStage,
        conversionRate: total ? Math.round((byStage.WON / total) * 100) : 0,
      },
    };
  }

  async create(user: RequestUser, payload: CreateLeadDto) {
    const organizationId = resolveOwnerOrganizationId(user);
    await this.ensureRelations(user, payload);

    const lead = await this.prisma.lead.create({
      data: {
        ...payload,
        nextContactAt: payload.nextContactAt
          ? new Date(payload.nextContactAt)
          : undefined,
        organizationId,
      },
      include: leadInclude,
    });

    return { success: true, message: 'Lid yaratildi', data: lead };
  }

  async update(user: RequestUser, id: number, payload: UpdateLeadDto) {
    await this.ensureOwned(user, id);
    await this.ensureRelations(user, payload);

    const lead = await this.prisma.lead.update({
      where: { id },
      data: {
        ...payload,
        nextContactAt: payload.nextContactAt
          ? new Date(payload.nextContactAt)
          : undefined,
      },
      include: leadInclude,
    });

    return { success: true, data: lead };
  }

  async updateStage(user: RequestUser, id: number, stage: LeadStage) {
    await this.ensureOwned(user, id);

    const lead = await this.prisma.lead.update({
      where: { id },
      data: { stage },
      include: leadInclude,
    });

    return { success: true, data: lead };
  }

  async remove(user: RequestUser, id: number) {
    await this.ensureOwned(user, id);

    await this.prisma.lead.update({
      where: { id },
      data: { status: Status.INACTIVE },
    });

    return { success: true, message: "Lid o'chirildi" };
  }

  /** Lid shu tashkilotnikimi — bo'lmasa "topilmadi". */
  private async ensureOwned(user: RequestUser, id: number) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, status: Status.ACTIVE, ...orgFilter(user) },
      select: { id: true },
    });

    if (!lead) {
      throw new NotFoundException('Lid topilmadi');
    }

    return lead;
  }

  /**
   * Kurs va mas'ul xodim so'rovchining tashkilotiga tegishli bo'lishi shart:
   * aks holda boshqa tashkilot kursining id sini yuborib, uning nomini
   * javobda ko'rib olish mumkin bo'lardi.
   */
  private async ensureRelations(
    user: RequestUser,
    payload: { courseId?: number; assignedToId?: number },
  ) {
    if (payload.courseId) {
      const course = await this.prisma.course.findFirst({
        where: { id: payload.courseId, ...orgFilter(user) },
        select: { id: true },
      });
      if (!course) throw new BadRequestException('Kurs topilmadi');
    }

    if (payload.assignedToId) {
      const assignee = await this.prisma.user.findFirst({
        where: { id: payload.assignedToId, ...orgFilter(user) },
        select: { id: true },
      });
      if (!assignee) throw new BadRequestException("Mas'ul xodim topilmadi");
    }
  }
}
