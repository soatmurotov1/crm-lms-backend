import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from '../bcrypt/bcrypt';
import { Role } from '@prisma/client';
import { normalizePhone } from '../utils/phone.util';

@Injectable()
export class UserSeeder implements OnModuleInit {
  private readonly logger = new Logger(UserSeeder.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Seeding xatosi butun ilovani yiqitmasligi kerak.
   *
   * `onModuleInit` dan chiqqan xato NestJS bootstrap'ini to'xtatadi va process
   * o'ladi. `restart: unless-stopped` bilan bu crash-loop'ga aylanadi va
   * deploy paytida `docker compose exec` "No such exec instance" degan
   * chalkash xato beradi - asl sabab esa mana shu yerda ko'rinmay qoladi.
   *
   * Superadmin yaratilmasa - bu jiddiy, lekin API'ning qolgan qismi
   * ishlayveradi va log'da aniq sabab turadi.
   */
  async onModuleInit() {
    try {
      await this.seedSuperAdmin();
    } catch (error) {
      this.logger.error(
        `Superadmin seeding bajarilmadi: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
      this.logger.error(
        "Migratsiyalar qo'llanganini tekshiring: npx prisma migrate deploy",
      );
    }
  }

  private async seedSuperAdmin() {
    const phone = normalizePhone(process.env.SUPERADMIN_PHONE);
    const password = process.env.SUPERADMIN_PASSWORD;

    if (!phone || !password) {
      this.logger.warn(
        "SUPERADMIN_PHONE yoki SUPERADMIN_PASSWORD sozlanmagan - seeding o'tkazib yuborildi",
      );
      return;
    }

    const existUser = await this.prisma.user.findFirst({
      where: { phone },
    });

    if (existUser) {
      this.logger.log('SuperAdmin already exist');
      return;
    }

    await this.prisma.user.create({
      data: {
        fullName: process.env.SUPERADMIN_FULLNAME || 'SuperAdmin',
        phone,
        password: await hashPassword(password),
        role: (process.env.SUPERADMIN_ROLE || 'SUPERADMIN') as Role,
        position: process.env.SUPERADMIN_POSIT || `${Role.ADMIN}`,
        hire_date: new Date('2026-01-01'),
      },
    });

    this.logger.log('SuperAdmin created');
  }
}
