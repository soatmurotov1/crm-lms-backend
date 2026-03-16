import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from '../bcrypt/bcrypt';
import { Role } from '@prisma/client';

@Injectable()
export class UserSeeder implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    const existUser = await this.prisma.user.findFirst({
      where: {
        email: process.env.SUPERADMIN_EMAIL,
      },
    });
    if (!existUser) {
      await this.prisma.user.create({
        data: {
          fullName: process.env.SUPERADMIN_FULLNAME || 'SuperAdmin',
          email: process.env.SUPERADMIN_EMAIL || `soatmurotovabrorbek23@gmail.com`,
          password: await hashPassword(
            process.env.SUPERADMIN_PASSWORD || 'sdfghjkl;kjhg',
          ),
          role: (process.env.SUPERADMIN_ROLE || 'SUPERADMIN') as any,
          position: process.env.SUPERADMIN_POSIT || `${Role.ADMIN}`,
          hire_date: new Date('2026-01-01'),
        }
      })
      Logger.log('SuperAdmin created')
    } else {
      Logger.log('SuperAdmin already exist');
    }
  }
}
