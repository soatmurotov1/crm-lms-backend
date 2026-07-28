import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Status, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(private prisma: PrismaService) {}

  async getAll(status?: string) {
    const organizations = await this.prisma.organization.findMany({
      where:
        status && status !== 'ALL' ? { status: status as Status } : undefined,
      include: {
        subscriptions: {
          where: { status: SubscriptionStatus.ACTIVE },
          include: { plan: true },
          orderBy: { endDate: 'desc' },
          take: 1,
        },
        _count: { select: { subscriptions: true, supportTickets: true } },
      },
      orderBy: { name: 'asc' },
    });

    return {
      success: true,
      data: organizations.map((organization) => ({
        ...organization,
        activeSubscription: organization.subscriptions[0] || null,
        subscriptions: undefined,
      })),
    };
  }

  async getOne(id: number) {
    const organization = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        subscriptions: {
          include: { plan: true },
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!organization) {
      throw new NotFoundException('Tashkilot topilmadi');
    }

    return { success: true, data: organization };
  }

  async create(payload: CreateOrganizationDto) {
    await this.ensureNameIsFree(payload.name);

    const organization = await this.prisma.organization.create({
      data: payload,
    });

    return {
      success: true,
      message: 'Tashkilot yaratildi',
      data: organization,
    };
  }

  async update(id: number, payload: UpdateOrganizationDto) {
    await this.ensureExists(id);

    if (payload.name) {
      await this.ensureNameIsFree(payload.name, id);
    }

    const organization = await this.prisma.organization.update({
      where: { id },
      data: payload,
    });

    return {
      success: true,
      message: 'Tashkilot yangilandi',
      data: organization,
    };
  }

  async remove(id: number) {
    await this.ensureExists(id);
    await this.prisma.organization.delete({ where: { id } });

    return { success: true, message: "Tashkilot o'chirildi" };
  }

  private async ensureExists(id: number) {
    const organization = await this.prisma.organization.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!organization) {
      throw new NotFoundException('Tashkilot topilmadi');
    }
  }

  private async ensureNameIsFree(name: string, excludeId?: number) {
    const existing = await this.prisma.organization.findFirst({
      where: {
        name,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Bu nomli tashkilot allaqachon mavjud');
    }
  }
}
