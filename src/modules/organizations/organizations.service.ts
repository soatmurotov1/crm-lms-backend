import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  Role,
  Status,
  SubscriptionStatus,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { hashPassword } from 'src/common/bcrypt/bcrypt';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

/// Tashkilot bilan birga ochiladigan admin hisobning lavozimi.
const ORG_ADMIN_POSITION = 'Tashkilot admini';

/** Ro'yxatda va javoblarda ko'rsatiladigan admin maydonlari (parolsiz). */
const ADMIN_SELECT = {
  id: true,
  fullName: true,
  phone: true,
  role: true,
  status: true,
} satisfies Prisma.UserSelect;

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
        users: {
          where: { role: Role.ADMIN },
          select: ADMIN_SELECT,
          orderBy: { created_at: 'asc' },
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
        admin: organization.users[0] || null,
        subscriptions: undefined,
        users: undefined,
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
        users: { select: ADMIN_SELECT, orderBy: { created_at: 'asc' } },
      },
    });

    if (!organization) {
      throw new NotFoundException('Tashkilot topilmadi');
    }

    return {
      success: true,
      data: {
        ...organization,
        admin:
          organization.users.find((user) => user.role === Role.ADMIN) || null,
      },
    };
  }

  /**
   * Tashkilot yaratiladi va u bilan birga ADMIN hisob ochiladi: tashkilot
   * telefon raqami login, kiritilgan parol esa shu hisobning paroli bo'ladi.
   */
  async create(payload: CreateOrganizationDto) {
    const { password, adminName, ...organizationData } = payload;

    await this.ensureNameIsFree(organizationData.name);
    await this.ensurePhoneIsFree(organizationData.phone);

    // Hashlash sekin, shuning uchun tranzaksiyadan tashqarida bajariladi.
    const passwordHash = await hashPassword(password);

    const organization = await this.prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({ data: organizationData });

      await tx.user.create({
        data: {
          fullName:
            adminName || organizationData.directorName || organizationData.name,
          phone: organizationData.phone,
          password: passwordHash,
          position: ORG_ADMIN_POSITION,
          hire_date: new Date(),
          role: Role.ADMIN,
          organizationId: created.id,
        },
      });

      return created;
    });

    return {
      success: true,
      message: 'Tashkilot va uning admin hisobi yaratildi',
      data: organization,
    };
  }

  /**
   * Tashkilot ma'lumotlari yangilanadi. Telefon yoki parol o'zgarsa, admin
   * hisobning login ma'lumotlari ham birga yangilanadi.
   */
  async update(id: number, payload: UpdateOrganizationDto) {
    const existing = await this.prisma.organization.findUnique({
      where: { id },
      select: { id: true, phone: true },
    });

    if (!existing) {
      throw new NotFoundException('Tashkilot topilmadi');
    }

    const { password, adminName, ...organizationData } = payload;

    if (organizationData.name) {
      await this.ensureNameIsFree(organizationData.name, id);
    }

    const admin = await this.prisma.user.findFirst({
      where: { organizationId: id, role: Role.ADMIN },
      orderBy: { created_at: 'asc' },
      select: { id: true, phone: true },
    });

    const adminPhone = organizationData.phone || existing.phone;

    if (organizationData.phone) {
      await this.ensurePhoneIsFree(organizationData.phone, admin?.id);
    }

    // Eski tashkilotlarda admin hisob yo'q — parol berilsa yangisini ochamiz,
    // shuning uchun raqam bandligini oldindan tekshirib qo'yamiz.
    if (!admin && password) {
      if (!adminPhone) {
        throw new ConflictException(
          'Admin hisob ochish uchun tashkilot telefon raqami kerak',
        );
      }
      if (!organizationData.phone) {
        await this.ensurePhoneIsFree(adminPhone);
      }
    }

    const adminData: Prisma.UserUpdateInput = {};
    if (organizationData.phone) adminData.phone = organizationData.phone;
    if (adminName) adminData.fullName = adminName;
    if (password) adminData.password = await hashPassword(password);

    const organization = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.organization.update({
        where: { id },
        data: organizationData,
      });

      if (admin) {
        if (Object.keys(adminData).length > 0) {
          await tx.user.update({ where: { id: admin.id }, data: adminData });
        }
      } else if (password && adminPhone) {
        // Bu o'zgarishdan oldin yaratilgan tashkilotlarda admin hisob yo'q —
        // parol kiritilgan bo'lsa, shu yerda ochib beramiz.
        await tx.user.create({
          data: {
            fullName: adminName || updated.directorName || updated.name,
            phone: adminPhone,
            password: adminData.password as string,
            position: ORG_ADMIN_POSITION,
            hire_date: new Date(),
            role: Role.ADMIN,
            organizationId: updated.id,
          },
        });
      }

      return updated;
    });

    return {
      success: true,
      message: 'Tashkilot yangilandi',
      data: organization,
    };
  }

  async remove(id: number) {
    await this.ensureExists(id);

    await this.prisma.$transaction(async (tx) => {
      // Hisoblarni o'chirib bo'lmaydi — ular guruh, dars va baholarga bog'langan
      // bo'lishi mumkin. Shuning uchun tizimga kira olmaydigan qilib qo'yamiz;
      // aks holda tashkilot o'chgach ham admin eski paroli bilan kiraveradi.
      await tx.user.updateMany({
        where: { organizationId: id },
        data: { status: UserStatus.INACTIVE },
      });

      await tx.organization.delete({ where: { id } });
    });

    return {
      success: true,
      message: "Tashkilot o'chirildi va uning hisoblari bloklandi",
    };
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

  /**
   * Raqam uchala hisob jadvalida ham band bo'lmasligi kerak, aks holda login
   * qaysi hisobga tegishli ekani noaniq bo'lib qoladi.
   */
  private async ensurePhoneIsFree(phone: string, excludeUserId?: number) {
    const [user, teacher, student] = await Promise.all([
      this.prisma.user.findUnique({ where: { phone }, select: { id: true } }),
      this.prisma.teacher.findUnique({ where: { phone }, select: { id: true } }),
      this.prisma.student.findUnique({ where: { phone }, select: { id: true } }),
    ]);

    const takenByOther =
      (user && user.id !== excludeUserId) || teacher || student;

    if (takenByOther) {
      throw new ConflictException(
        "Bu telefon raqami allaqachon ro'yxatdan o'tgan. Boshqa raqam kiriting",
      );
    }
  }
}
