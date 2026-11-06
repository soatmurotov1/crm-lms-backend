import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Status } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import { isSuperAdmin } from 'src/common/utils/org-scope.util';
import { CROSS_BRANCH_ROLES, type V2Actor } from './v2-auth.guard';
import { optionalId } from './v2.mapper';

/** Tashkilot sharti: bo'sh obyekt — cheklov yo'q (faqat SUPERADMIN). */
export type OrgWhere = { organizationId?: number };

/** O'qish so'rovining doirasi: qaysi tashkilot va (bo'lsa) qaysi filial. */
export interface ReadScope {
  /** `null` — hech narsa ko'rinmaydi (tashkilotsiz xodim). */
  org: OrgWhere | null;
  /** `null` — barcha filiallar. */
  branchId: number | null;
}

@Injectable()
export class V2ScopeService {
  constructor(private prisma: PrismaService) {}

  /**
   * So'rov qaysi tashkilot ma'lumotini ko'radi.
   *
   * `null` — "hech narsa": tashkilotga biriktirilmagan xodim. Bu yerda
   * `orgFilter` ishlatilmaydi, chunki u bunday hisobga
   * `{ organizationId: null }` qaytaradi va bu shart tashkilotsiz
   * yozuvlarning HAMMASIGA mos keladi.
   *
   * `companyId` faqat SUPERADMIN uchun: bitta tashkilot nomidan ko'rish.
   */
  org(user: RequestUser, companyId?: number): OrgWhere | null {
    if (isSuperAdmin(user)) {
      return companyId ? { organizationId: companyId } : {};
    }

    return user.organizationId ? { organizationId: user.organizationId } : null;
  }

  /**
   * Filial sharti. So'rovdagi `branch_id` sarlavhadagidan ustun turadi
   * (sarlavha `V2AuthGuard` da allaqachon tekshirilgan). Begona tashkilot
   * filiali bilan kelgan so'rov rad etiladi — jimgina bo'sh natija qaytarish
   * frontendda "ma'lumot yo'q" bo'lib ko'rinardi.
   */
  async branch(
    user: RequestUser,
    queryBranchId: string | undefined,
    headerBranchId: number | null,
  ): Promise<number | null> {
    if (!queryBranchId) return headerBranchId;

    const id = /^\d{1,9}$/.test(queryBranchId) ? Number(queryBranchId) : 0;
    if (id && id === headerBranchId) return id;

    await this.assertBranch(user, id);
    return id;
  }

  /**
   * O'qish doirasi. Filial tartibi: so'rovdagi `branch_id` → `X-Branch-Id`
   * → (filialga bog'langan rollar uchun) xodimning o'z filiali. Egasi,
   * platforma egasi va buxgalter filial tanlamasa — barcha filiallar.
   */
  async read(
    user: RequestUser,
    actor: V2Actor,
    headerBranchId: number | null,
    queryBranchId?: string,
  ): Promise<ReadScope> {
    const org = this.org(user);
    if (!org) return { org: null, branchId: null };

    const explicit = await this.branch(user, queryBranchId, headerBranchId);
    if (explicit) return { org, branchId: explicit };

    return {
      org,
      branchId: CROSS_BRANCH_ROLES.includes(actor.role)
        ? null
        : actor.homeBranchId,
    };
  }

  /**
   * Yangi yozuv uchun filial: tanadagi `branch_id` → `X-Branch-Id` →
   * xodimning o'z filiali. Filialsiz yozib bo'lmaydigan joylarda ishlatiladi.
   */
  async writeBranch(
    user: RequestUser,
    actor: V2Actor,
    headerBranchId: number | null,
    bodyBranchId?: string | null,
  ): Promise<{ branchId: number; organizationId: number }> {
    const fromBody = optionalId(bodyBranchId);
    if (fromBody === null) {
      throw new BadRequestException('Filial noto‘g‘ri');
    }

    const branchId = fromBody ?? headerBranchId ?? actor.homeBranchId;
    if (!branchId) {
      throw new BadRequestException('Filialni tanlang');
    }

    const branch = await this.assertBranch(user, branchId);
    return { branchId, organizationId: branch.organizationId };
  }

  /** Ixtiyoriy filial: bo'sh bo'lsa `null` (tashkilot darajasidagi yozuv). */
  async optionalBranch(
    user: RequestUser,
    value: string | null | undefined,
  ): Promise<number | null> {
    const id = optionalId(value);
    if (id === undefined) return null;
    if (id === null) throw new BadRequestException('Filial noto‘g‘ri');

    await this.assertBranch(user, id);
    return id;
  }

  /** Yozish uchun tashkilot. SUPERADMIN filial orqali aniqlanadi. */
  async writeOrg(user: RequestUser, branchId?: number | null): Promise<number> {
    if (user.organizationId) return user.organizationId;

    if (isSuperAdmin(user) && branchId) {
      const branch = await this.prisma.branch.findUnique({
        where: { id: branchId },
        select: { organizationId: true },
      });
      if (branch) return branch.organizationId;
    }

    throw new BadRequestException(
      'Hisob tashkilotga biriktirilmagan. Avval filialni tanlang',
    );
  }

  async assertBranch(
    user: RequestUser,
    id: number,
  ): Promise<{ organizationId: number; name: string }> {
    const branch = id
      ? await this.prisma.branch.findUnique({
          where: { id },
          select: { organizationId: true, status: true, name: true },
        })
      : null;

    if (
      !branch ||
      branch.status !== Status.ACTIVE ||
      (!isSuperAdmin(user) && branch.organizationId !== user.organizationId)
    ) {
      throw new ForbiddenException('Bu filialga kirish huquqingiz yo‘q');
    }

    return branch;
  }
}
