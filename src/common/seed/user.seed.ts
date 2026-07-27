import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from '../bcrypt/bcrypt';
import { Role } from '@prisma/client';
import { normalizePhone } from '../utils/phone.util';

@Injectable()
export class UserSeeder implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    const phone = normalizePhone(process.env.SUPERADMIN_PHONE);
    const password = process.env.SUPERADMIN_PASSWORD;

    if (!phone || !password) {
      Logger.warn(
        "SUPERADMIN_PHONE yoki SUPERADMIN_PASSWORD sozlanmagan - seeding o'tkazib yuborildi",
      );
      return;
    }

    const existUser = await this.prisma.user.findFirst({
      where: { phone },
    });
    if (!existUser) {
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
      Logger.log('SuperAdmin created');
    } else {
      Logger.log('SuperAdmin already exist');
    }
  }
}
