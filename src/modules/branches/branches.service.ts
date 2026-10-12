import { Injectable } from '@nestjs/common';
import { Status } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import { isSuperAdmin } from 'src/common/utils/org-scope.util';

@Injectable()
export class BranchesService {
  constructor(private prisma: PrismaService) {}

  /** Filial tanlagich uchun: faqat faol filiallar. */
  async list(user: RequestUser) {
    /*
      `Branch.organizationId` majburiy maydon, shuning uchun `orgFilter` ning
      `{ organizationId: null }` natijasi bu yerda ishlamaydi. Tashkilotsiz
      xodimga bo'sh ro'yxat qaytadi — shartni tushirib yuborish hamma
      tashkilotning filiallarini ochib qo'yardi.
    */
    if (!isSuperAdmin(user) && !user.organizationId) {
      return { success: true as const, data: [] };
    }

    const branches = await this.prisma.branch.findMany({
      where: {
        status: Status.ACTIVE,
        ...(isSuperAdmin(user)
          ? {}
          : { organizationId: user.organizationId as number }),
      },
      select: { id: true, name: true, status: true },
      orderBy: { id: 'asc' },
    });

    return { success: true as const, data: branches };
  }
}
