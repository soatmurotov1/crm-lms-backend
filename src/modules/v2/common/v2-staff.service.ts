import { Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import {
  parseStaffId,
  toId,
  toTeacherId,
  toV2Role,
  type StaffRef,
  type V2Role,
} from './v2.mapper';

export interface StaffSummary {
  id: string;
  name: string;
  role: V2Role;
  branchId: number | null;
  organizationId: number | null;
  specialization?: string;
  active: boolean;
}

/**
 * Xodimlar ikki jadvalda (`User` va `Teacher`), havolalar esa matn ko'rinishida
 * (`"12"`, `"t12"`) saqlanadi. Bu servis ularni ism va rolga aylantiradi.
 */
@Injectable()
export class V2StaffService {
  constructor(private prisma: PrismaService) {}

  async summaries(
    ids: (string | null | undefined)[],
  ): Promise<Map<string, StaffSummary>> {
    const refs = [...new Set(ids.filter((id): id is string => !!id))]
      .map(parseStaffId)
      .filter((ref): ref is StaffRef => !!ref);

    const userIds = refs.filter((r) => r.kind === 'user').map((r) => r.id);
    const teacherIds = refs.filter((r) => r.kind === 'teacher').map((r) => r.id);

    const [users, teachers] = await Promise.all([
      userIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: {
              id: true,
              fullName: true,
              role: true,
              branchId: true,
              organizationId: true,
              status: true,
              deleted_at: true,
            },
          })
        : [],
      teacherIds.length
        ? this.prisma.teacher.findMany({
            where: { id: { in: teacherIds } },
            select: {
              id: true,
              fullName: true,
              branchId: true,
              organizationId: true,
              specialization: true,
              status: true,
              deleted_at: true,
            },
          })
        : [],
    ]);

    const result = new Map<string, StaffSummary>();
    for (const row of users) {
      result.set(toId(row.id), {
        id: toId(row.id),
        name: row.fullName,
        role: toV2Role(row.role) ?? 'operator',
        branchId: row.branchId,
        organizationId: row.organizationId,
        active: row.status === UserStatus.ACTIVE && !row.deleted_at,
      });
    }
    for (const row of teachers) {
      result.set(toTeacherId(row.id), {
        id: toTeacherId(row.id),
        name: row.fullName,
        role: 'teacher',
        branchId: row.branchId,
        organizationId: row.organizationId,
        specialization: row.specialization,
        active: row.status === UserStatus.ACTIVE && !row.deleted_at,
      });
    }

    return result;
  }

  async summary(id: string | null | undefined): Promise<StaffSummary | null> {
    if (!id) return null;
    return (await this.summaries([id])).get(id) ?? null;
  }

  /** Tashkilotdagi faol xodim (yoki o'qituvchi) — topilmasa `null`. */
  async findInOrg(
    id: string | null | undefined,
    organizationId: number,
  ): Promise<StaffSummary | null> {
    const summary = await this.summary(id);
    return summary && summary.active && summary.organizationId === organizationId
      ? summary
      : null;
  }
}
