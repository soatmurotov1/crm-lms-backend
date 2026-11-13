import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/common/prisma/prisma.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import type { V2Actor } from '../common/v2-auth.guard';
import { V2ScopeService } from '../common/v2-scope.service';
import { optionalId } from '../common/v2.mapper';

/** LMS bo'limlarini boshqara oladigan rollar (o'qituvchi faqat o'z guruhlarida). */
export const LMS_READERS = [
  'dev',
  'owner',
  'manager',
  'operator',
  'teacher',
] as const;
export const LMS_WRITERS = ['dev', 'owner', 'manager', 'teacher'] as const;
export const LMS_ADMINS = ['dev', 'owner', 'manager'] as const;

/**
 * LMS modullari uchun umumiy doira tekshiruvi: hamma yozuv tashkilotga
 * tegishli, o'qituvchi esa faqat o'zi dars beradigan guruhlar bilan ishlaydi.
 */
@Injectable()
export class LmsAccessService {
  constructor(
    private prisma: PrismaService,
    private scope: V2ScopeService,
  ) {}

  /** O'qish uchun tashkilot id'si; `null` — hech narsa ko'rinmaydi. */
  readOrg(user: RequestUser): number | null | 'all' {
    const org = this.scope.org(user);
    if (!org) return null;
    return org.organizationId ?? 'all';
  }

  /** Prisma `where` uchun tashkilot sharti. */
  orgWhere(user: RequestUser): { organizationId?: number } | null {
    const org = this.readOrg(user);
    if (org === null) return null;
    return org === 'all' ? {} : { organizationId: org };
  }

  writeOrg(user: RequestUser, branchId: number | null): Promise<number> {
    return this.scope.writeOrg(user, branchId);
  }

  isTeacher(actor: V2Actor): boolean {
    return actor.role === 'teacher' && actor.ref.kind === 'teacher';
  }

  /** O'qituvchi dars beradigan guruhlar (`null` — cheklov yo'q). */
  async teacherGroupIds(actor: V2Actor): Promise<number[] | null> {
    if (!this.isTeacher(actor)) return null;
    const rows = await this.prisma.group.findMany({
      where: { teacherId: actor.ref.id, deleted_at: null },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async course(organizationId: number | null, value: string | null | undefined) {
    const id = this.id(value, 'Kurs');
    if (id === undefined || id === null) return null;
    const row = await this.prisma.course.findFirst({
      where: {
        id,
        deleted_at: null,
        ...(organizationId ? { organizationId } : {}),
      },
      select: { id: true, name: true, organizationId: true },
    });
    if (!row) throw new BadRequestException('Kurs topilmadi');
    return row;
  }

  async group(
    organizationId: number | null,
    value: string | null | undefined,
    actor?: V2Actor,
  ) {
    const id = this.id(value, 'Guruh');
    if (id === undefined || id === null) return null;
    const row = await this.prisma.group.findFirst({
      where: {
        id,
        deleted_at: null,
        ...(organizationId ? { organizationId } : {}),
      },
      select: {
        id: true,
        name: true,
        courseId: true,
        teacherId: true,
        organizationId: true,
      },
    });
    if (!row) throw new BadRequestException('Guruh topilmadi');
    if (actor && this.isTeacher(actor) && row.teacherId !== actor.ref.id) {
      throw new ForbiddenException('Bu guruh sizga biriktirilmagan');
    }
    return row;
  }

  async student(organizationId: number | null, value: string | null | undefined) {
    const id = this.id(value, 'O‘quvchi');
    if (!id) throw new BadRequestException('O‘quvchini tanlang');
    const row = await this.prisma.student.findFirst({
      where: {
        id,
        deleted_at: null,
        ...(organizationId ? { organizationId } : {}),
      },
      select: { id: true, fullName: true, organizationId: true },
    });
    if (!row) throw new BadRequestException('O‘quvchi topilmadi');
    return row;
  }

  /**
   * O'qituvchi yozuvni (topshiriq/test) o'zgartira oladimi: yozuv uning
   * guruhiga tegishli bo'lishi shart. Guruhsiz (kurs darajasidagi) yozuvni
   * faqat admin rollar o'zgartiradi.
   */
  async assertCanEdit(actor: V2Actor, groupId: number | null): Promise<void> {
    if (!this.isTeacher(actor)) return;
    const groups = (await this.teacherGroupIds(actor)) ?? [];
    if (!groupId || !groups.includes(groupId)) {
      throw new ForbiddenException('Bu yozuvni o‘zgartirishga ruxsat yo‘q');
    }
  }

  notFound(label: string): never {
    throw new NotFoundException(`${label} topilmadi`);
  }

  private id(value: string | null | undefined, label: string) {
    const id = optionalId(value);
    if (id === null) throw new BadRequestException(`${label} noto‘g‘ri`);
    return id;
  }
}
