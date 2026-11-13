import { Injectable } from '@nestjs/common';
import { CourseType, Role, Status, UserStatus } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import { V2ScopeService } from '../common/v2-scope.service';
import { toId, toTeacherId } from '../common/v2.mapper';

export interface V2SearchItem {
  id: string;
  label: string;
  subtitle: string;
}

const MIN_QUERY_LENGTH = 2;
const PER_GROUP = 5;

const STAFF_LABEL: Partial<Record<Role, string>> = {
  [Role.ADMIN]: 'Direktor',
  [Role.MANAGEMENT]: 'Menejer',
  [Role.ADMINSTRATOR]: 'Operator',
  [Role.ACCOUNTANT]: 'Buxgalter',
};

@Injectable()
export class V2SearchService {
  constructor(
    private prisma: PrismaService,
    private scope: V2ScopeService,
  ) {}

  async search(user: RequestUser, rawQuery: string, branchId: number | null) {
    const query = (rawQuery ?? '').trim();
    const org = this.scope.org(user);
    const empty = { students: [], groups: [], staff: [] };

    if (!org || query.length < MIN_QUERY_LENGTH) return { data: empty };

    const name = { contains: query, mode: 'insensitive' as const };
    // Telefon "+998 90 123-45-67" ko'rinishida yozilishi mumkin.
    const digits = query.replace(/[\s()+-]/g, '');
    const byPerson = [
      { fullName: name },
      ...(/^\d{3,}$/.test(digits) ? [{ phone: { contains: digits } }] : []),
    ];
    const branch = branchId ? { branchId } : {};

    const [students, groups, users, teachers] = await Promise.all([
      this.prisma.student.findMany({
        where: { ...org, ...branch, deleted_at: null, OR: byPerson },
        select: { id: true, fullName: true, phone: true },
        orderBy: { fullName: 'asc' },
        take: PER_GROUP,
      }),
      this.prisma.group.findMany({
        where: { ...org, ...branch, status: Status.ACTIVE, deleted_at: null, name },
        select: {
          id: true,
          name: true,
          courseType: true,
          course: { select: { name: true } },
        },
        orderBy: { name: 'asc' },
        take: PER_GROUP,
      }),
      this.prisma.user.findMany({
        where: {
          ...org,
          status: UserStatus.ACTIVE,
          deleted_at: null,
          role: {
            in: [Role.ADMIN, Role.MANAGEMENT, Role.ADMINSTRATOR, Role.ACCOUNTANT],
          },
          OR: byPerson,
        },
        select: { id: true, fullName: true, role: true },
        orderBy: { fullName: 'asc' },
        take: PER_GROUP,
      }),
      this.prisma.teacher.findMany({
        where: { ...org, status: UserStatus.ACTIVE, deleted_at: null, OR: byPerson },
        select: { id: true, fullName: true },
        orderBy: { fullName: 'asc' },
        take: PER_GROUP,
      }),
    ]);

    const staff: V2SearchItem[] = [
      ...users.map((row) => ({
        id: toId(row.id),
        label: row.fullName,
        subtitle: STAFF_LABEL[row.role] ?? '',
      })),
      ...teachers.map((row) => ({
        id: toTeacherId(row.id),
        label: row.fullName,
        subtitle: 'O‘qituvchi',
      })),
    ].slice(0, PER_GROUP);

    return {
      data: {
        students: students.map((row) => ({
          id: toId(row.id),
          label: row.fullName,
          subtitle: row.phone,
        })),
        groups: groups.map((row) => ({
          id: toId(row.id),
          label: row.name,
          subtitle:
            row.course?.name ??
            (row.courseType === CourseType.ONLINE ? 'Onlayn' : 'Oflayn'),
        })),
        staff,
      },
    };
  }
}
