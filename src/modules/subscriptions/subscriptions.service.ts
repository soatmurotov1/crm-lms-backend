import { Injectable, NotFoundException } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';

@Injectable()
export class SubscriptionsService {
  constructor(private prisma: PrismaService) {}

  async getAll(status?: string, organizationId?: number) {
    const subscriptions = await this.prisma.subscription.findMany({
      where: {
        ...(status && status !== 'ALL'
          ? { status: status as SubscriptionStatus }
          : {}),
        ...(organizationId ? { organizationId } : {}),
      },
      include: {
        organization: { select: { id: true, name: true, status: true } },
        plan: { select: { id: true, name: true, price: true } },
      },
      orderBy: [{ status: 'asc' }, { endDate: 'desc' }],
    });

    return { success: true, data: subscriptions };
  }

  /** Superadmin dashboard uchun qisqa yig'indi. */
  async getSummary() {
    const [byStatus, organizations, expiringSoon] = await Promise.all([
      this.prisma.subscription.groupBy({
        by: ['status'],
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.organization.count(),
      this.prisma.subscription.count({
        where: {
          status: SubscriptionStatus.ACTIVE,
          endDate: {
            lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    const counts = {
      PENDING: 0,
      ACTIVE: 0,
      EXPIRED: 0,
      CANCELED: 0,
    };
    let totalAmount = 0;

    byStatus.forEach((row) => {
      counts[row.status] = row._count._all;
      totalAmount += Number(row._sum.amount || 0);
    });

    return {
      success: true,
      data: {
        organizations,
        expiringSoon,
        totalAmount,
        ...counts,
      },
    };
  }

  async create(payload: CreateSubscriptionDto) {
    const plan = await this.prisma.plan.findUnique({
      where: { id: payload.planId },
    });
    if (!plan) {
      throw new NotFoundException('Tarif topilmadi');
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: payload.organizationId },
      select: { id: true },
    });
    if (!organization) {
      throw new NotFoundException('Tashkilot topilmadi');
    }

    const startDate = payload.startDate
      ? new Date(payload.startDate)
      : new Date();

    // Muddat berilmasa, tarif davomiyligidan hisoblanadi.
    const endDate = payload.endDate
      ? new Date(payload.endDate)
      : new Date(
          new Date(startDate).setMonth(
            startDate.getMonth() + (plan.durationMonth || 1),
          ),
        );

    const subscription = await this.prisma.subscription.create({
      data: {
        organizationId: payload.organizationId,
        planId: payload.planId,
        startDate,
        endDate,
        amount: payload.amount ?? plan.price,
        status: payload.status ?? SubscriptionStatus.PENDING,
        comment: payload.comment,
        paidAt:
          payload.status === SubscriptionStatus.ACTIVE ? new Date() : null,
      },
      include: { organization: true, plan: true },
    });

    return {
      success: true,
      message: 'Obuna yaratildi',
      data: subscription,
    };
  }

  async update(id: number, payload: UpdateSubscriptionDto) {
    await this.ensureExists(id);

    const subscription = await this.prisma.subscription.update({
      where: { id },
      data: {
        ...(payload.organizationId
          ? { organizationId: payload.organizationId }
          : {}),
        ...(payload.planId ? { planId: payload.planId } : {}),
        ...(payload.startDate
          ? { startDate: new Date(payload.startDate) }
          : {}),
        ...(payload.endDate ? { endDate: new Date(payload.endDate) } : {}),
        ...(payload.amount !== undefined ? { amount: payload.amount } : {}),
        ...(payload.comment !== undefined ? { comment: payload.comment } : {}),
        ...(payload.status
          ? {
              status: payload.status,
              paidAt:
                payload.status === SubscriptionStatus.ACTIVE
                  ? new Date()
                  : undefined,
              canceledAt:
                payload.status === SubscriptionStatus.CANCELED
                  ? new Date()
                  : undefined,
            }
          : {}),
      },
      include: { organization: true, plan: true },
    });

    return {
      success: true,
      message: 'Obuna yangilandi',
      data: subscription,
    };
  }

  async remove(id: number) {
    await this.ensureExists(id);
    await this.prisma.subscription.delete({ where: { id } });

    return { success: true, message: "Obuna o'chirildi" };
  }

  private async ensureExists(id: number) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!subscription) {
      throw new NotFoundException('Obuna topilmadi');
    }
  }
}
