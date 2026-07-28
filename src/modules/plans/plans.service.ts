import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Status, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Injectable()
export class PlansService {
  constructor(private prisma: PrismaService) {}

  async getAll(status?: string) {
    const plans = await this.prisma.plan.findMany({
      where:
        status && status !== 'ALL' ? { status: status as Status } : undefined,
      include: {
        _count: {
          select: { subscriptions: true },
        },
      },
      orderBy: { price: 'asc' },
    });

    // Har bir tarif bo'yicha faol obunalar soni — "tariflar bo'yicha taqsimot".
    const activeCounts = await this.prisma.subscription.groupBy({
      by: ['planId'],
      where: { status: SubscriptionStatus.ACTIVE },
      _count: { _all: true },
    });

    const activeMap = new Map(
      activeCounts.map((row) => [row.planId, row._count._all]),
    );

    return {
      success: true,
      data: plans.map((plan) => ({
        ...plan,
        activeSubscriptions: activeMap.get(plan.id) || 0,
      })),
    };
  }

  async getOne(id: number) {
    const plan = await this.prisma.plan.findUnique({
      where: { id },
      include: {
        subscriptions: {
          include: { organization: true },
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!plan) {
      throw new NotFoundException('Tarif topilmadi');
    }

    return { success: true, data: plan };
  }

  async create(payload: CreatePlanDto) {
    await this.ensureNameIsFree(payload.name);

    const plan = await this.prisma.plan.create({
      data: {
        ...payload,
        features: payload.features ?? [],
      },
    });

    return { success: true, message: 'Tarif yaratildi', data: plan };
  }

  async update(id: number, payload: UpdatePlanDto) {
    await this.ensureExists(id);

    if (payload.name) {
      await this.ensureNameIsFree(payload.name, id);
    }

    const plan = await this.prisma.plan.update({
      where: { id },
      data: payload,
    });

    return { success: true, message: 'Tarif yangilandi', data: plan };
  }

  async remove(id: number) {
    await this.ensureExists(id);

    const usedCount = await this.prisma.subscription.count({
      where: { planId: id },
    });

    if (usedCount > 0) {
      throw new ConflictException(
        "Bu tarifda obunalar bor — avval obunalarni o'zgartiring",
      );
    }

    await this.prisma.plan.delete({ where: { id } });

    return { success: true, message: "Tarif o'chirildi" };
  }

  private async ensureExists(id: number) {
    const plan = await this.prisma.plan.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!plan) {
      throw new NotFoundException('Tarif topilmadi');
    }
  }

  private async ensureNameIsFree(name: string, excludeId?: number) {
    const existing = await this.prisma.plan.findFirst({
      where: {
        name,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Bu nomli tarif allaqachon mavjud');
    }
  }
}
