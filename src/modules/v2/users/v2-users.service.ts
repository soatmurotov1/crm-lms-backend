import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, Role, Status, UserStatus } from '@prisma/client';
import { hashPassword } from 'src/common/bcrypt/bcrypt';
import { PrismaService } from 'src/common/prisma/prisma.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import { SessionService } from 'src/common/session/session.service';
import { generateRandomPassword } from 'src/common/utils/password.util';
import { CROSS_BRANCH_ROLES, type V2Actor } from '../common/v2-auth.guard';
import { V2AuditService, diff } from '../common/v2-audit.service';
import { uniqueGuard } from '../common/v2-errors';
import { pageOf, paginated } from '../common/v2-pagination';
import {
  ALL_PERMISSIONS,
  OWN_RESOURCES,
  ROLE_TEMPLATES,
  parseStoredAccess,
  type PermissionAssignment,
  type StoredAccess,
} from '../common/v2-permissions';
import { V2ScopeService, type OrgWhere } from '../common/v2-scope.service';
import {
  USER_ROLE_OF,
  parseStaffId,
  percent,
  toId,
  toTeacherId,
  toV2Role,
  type StaffRef,
  type V2Role,
} from '../common/v2.mapper';
import type {
  V2CreateUserDto,
  V2PermissionTemplateDto,
  V2UpdateAccessDto,
  V2UpdateUserDto,
  V2UsersQueryDto,
} from './v2-users.dto';

/** Telefonsiz yaratilgan xodim uchun vaqtinchalik unikal qiymat. */
const NO_PHONE = 'nophone-';
const DUPLICATE = 'Bu telefon raqami yoki email allaqachon band';

const POSITION: Record<V2Role, string> = {
  dev: 'Platforma',
  owner: 'Direktor',
  manager: 'Menejer',
  accountant: 'Buxgalter',
  operator: 'Operator',
  teacher: 'O‘qituvchi',
};

/** Kim qaysi rolni yarata / boshqara oladi. */
const MANAGEABLE: Record<V2Role, V2Role[]> = {
  dev: ['dev', 'owner', 'manager', 'accountant', 'operator', 'teacher'],
  owner: ['owner', 'manager', 'accountant', 'operator', 'teacher'],
  manager: ['operator', 'teacher'],
  accountant: [],
  operator: [],
  teacher: [],
};

const USER_SELECT = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  photo: true,
  role: true,
  status: true,
  branchId: true,
  organizationId: true,
  accessVersion: true,
  permissions: true,
  deleted_at: true,
  created_at: true,
  branch: { select: { name: true } },
  managedBranches: {
    where: { status: Status.ACTIVE },
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
    take: 1,
  },
} satisfies Prisma.UserSelect;

const TEACHER_SELECT = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  photo: true,
  status: true,
  specialization: true,
  branchId: true,
  organizationId: true,
  accessVersion: true,
  permissions: true,
  deleted_at: true,
  created_at: true,
  branch: { select: { name: true } },
} satisfies Prisma.TeacherSelect;

/** Ikkala jadvaldagi xodim — bitta ko'rinishda. */
interface StaffItem {
  ref: StaffRef;
  id: string;
  name: string;
  email: string | null;
  phone: string;
  avatar: string | null;
  role: V2Role;
  branchId: number | null;
  branchName: string | null;
  specialization?: 'THEORY' | 'PRACTICE';
  status: UserStatus;
  organizationId: number | null;
  accessVersion: number;
  permissions: unknown;
  deletedAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class V2UsersService {
  constructor(
    private prisma: PrismaService,
    private scope: V2ScopeService,
    private sessions: SessionService,
    private audit: V2AuditService,
  ) {}

  async list(
    user: RequestUser,
    actor: V2Actor,
    query: V2UsersQueryDto,
    headerBranchId: number | null,
  ) {
    const { page, limit, skip } = pageOf(query, 10);
    const companyId = Number(query.company_id ?? query.companyId) || undefined;
    const org = this.scope.org(user, companyId);
    if (!org) return paginated([], 0, page, limit);

    if (query.include_deleted && !isOwner(actor)) {
      throw new ForbiddenException();
    }

    const explicit = await this.scope.branch(user, query.branchId, null);
    const branchId =
      explicit ??
      (CROSS_BRANCH_ROLES.includes(actor.role) ? headerBranchId : null) ??
      (actor.role === 'manager' || actor.role === 'operator'
        ? (headerBranchId ?? actor.homeBranchId)
        : null);

    const items = await this.findStaff(org, {
      role: query.role,
      branchId,
      search: query.search,
      isActive: query.isActive,
      includeDeleted: Boolean(query.include_deleted),
    });

    const pageItems = items.slice(skip, skip + limit);
    const metrics = await this.metrics(pageItems);

    return paginated(
      pageItems.map((item) => ({ ...this.toUser(item), ...metrics.get(item.id) })),
      items.length,
      page,
      limit,
    );
  }

  async detail(user: RequestUser, id: string) {
    const item = await this.findOwned(user, id, true);
    const [metrics, extras] = await Promise.all([
      this.metrics([item]),
      this.relations(item),
    ]);

    return { data: { ...this.toUser(item), ...metrics.get(item.id), ...extras } };
  }

  async create(
    user: RequestUser,
    actor: V2Actor,
    payload: V2CreateUserDto,
    headerBranchId: number | null,
  ) {
    this.assertManageable(actor, payload.role);

    const needsBranch = payload.role === 'teacher' || payload.role === 'operator';
    const branchId =
      payload.branchId || needsBranch
        ? (
            await this.scope.writeBranch(
              user,
              actor,
              headerBranchId,
              payload.branchId,
            )
          ).branchId
        : null;
    // Menejer faqat o'z filialiga xodim qo'sha oladi.
    if (actor.role === 'manager' && branchId && actor.homeBranchId && branchId !== actor.homeBranchId) {
      throw new ForbiddenException('Faqat o‘z filialingizga xodim qo‘sha olasiz');
    }
    const organizationId = await this.scope.writeOrg(user, branchId);
    const password = await hashPassword(
      payload.password ?? generateRandomPassword(16),
    );

    let ref: StaffRef;
    if (payload.role === 'teacher') {
      if (!payload.phone) {
        throw new BadRequestException('O‘qituvchi telefon raqami kiritilishi kerak');
      }
      const specialization = payload.specialization ?? 'THEORY';
      const teacher = await uniqueGuard(
        () =>
          this.prisma.teacher.create({
            data: {
              fullName: payload.fullName,
              phone: payload.phone as string,
              email: payload.email ?? null,
              password,
              position:
                specialization === 'PRACTICE'
                  ? 'Amaliy haydash ustozi'
                  : 'Nazariya o‘qituvchisi',
              experience: 0,
              specialization,
              branchId,
              organizationId,
            },
            select: { id: true },
          }),
        DUPLICATE,
      );
      ref = { kind: 'teacher', id: teacher.id };
    } else {
      const created = await uniqueGuard(
        () =>
          this.prisma.user.create({
            data: {
              fullName: payload.fullName,
              phone: payload.phone ?? `${NO_PHONE}${randomUUID()}`,
              email: payload.email ?? null,
              password,
              role: USER_ROLE_OF[payload.role] ?? Role.ADMINSTRATOR,
              position: POSITION[payload.role],
              hire_date: new Date(),
              branchId,
              organizationId,
            },
            select: { id: true },
          }),
        DUPLICATE,
      );
      ref = { kind: 'user', id: created.id };

      // Filialning menejeri bo'lmasa — shu xodim bo'ladi.
      if (payload.role === 'manager' && branchId) {
        await this.prisma.branch.updateMany({
          where: { id: branchId, managerId: null },
          data: { managerId: created.id },
        });
      }
    }

    const id = ref.kind === 'teacher' ? toTeacherId(ref.id) : toId(ref.id);
    await this.audit.record(actor, 'CREATE', 'user', id, {
      organizationId,
      branchId,
      changes: {
        name: payload.fullName,
        role: payload.role,
        phone: payload.phone ?? null,
        email: payload.email ?? null,
      },
    });

    return this.detail(user, id);
  }

  async update(
    user: RequestUser,
    actor: V2Actor,
    id: string,
    payload: V2UpdateUserDto,
  ) {
    const before = await this.findOwned(user, id);
    if (before.ref.kind !== actor.ref.kind || before.ref.id !== actor.ref.id) {
      this.assertManageable(actor, before.role);
    }

    const branchId =
      payload.branchId !== undefined
        ? payload.branchId
          ? (await this.scope.writeBranch(user, actor, null, payload.branchId))
              .branchId
          : null
        : undefined;

    const data = {
      ...(payload.fullName !== undefined ? { fullName: payload.fullName } : {}),
      ...(payload.phone !== undefined ? { phone: payload.phone } : {}),
      ...(payload.email !== undefined ? { email: payload.email || null } : {}),
      ...(branchId !== undefined ? { branchId } : {}),
    };

    await uniqueGuard(async () => {
      if (before.ref.kind === 'teacher') {
        await this.prisma.teacher.update({
          where: { id: before.ref.id },
          data: {
            ...data,
            ...(payload.specialization
              ? { specialization: payload.specialization }
              : {}),
          },
        });
      } else {
        await this.prisma.user.update({ where: { id: before.ref.id }, data });
      }
    }, DUPLICATE);

    const result = await this.detail(user, id);
    await this.audit.record(actor, 'UPDATE', 'user', id, {
      organizationId: before.organizationId,
      branchId: branchId ?? before.branchId,
      changes: diff(this.toUser(before), result.data),
    });

    return result;
  }

  async remove(user: RequestUser, actor: V2Actor, id: string): Promise<void> {
    const item = await this.findOwned(user, id);
    this.assertNotSelf(actor, item);
    this.assertManageable(actor, item.role);

    await this.setStatus(item, {
      deleted_at: new Date(),
      status: UserStatus.INACTIVE,
    });
    await this.sessions.revokeAllForAccount(item.ref.id, item.ref.kind);
    await this.audit.record(actor, 'DELETE', 'user', id, {
      organizationId: item.organizationId,
      branchId: item.branchId,
      changes: { name: item.name, role: item.role },
    });
  }

  async setActive(
    user: RequestUser,
    actor: V2Actor,
    id: string,
    active: boolean,
  ): Promise<void> {
    const item = await this.findOwned(user, id);
    this.assertNotSelf(actor, item);
    this.assertManageable(actor, item.role);

    await this.setStatus(item, {
      status: active ? UserStatus.ACTIVE : UserStatus.INACTIVE,
    });
    if (!active) {
      await this.sessions.revokeAllForAccount(item.ref.id, item.ref.kind);
    }
    await this.audit.record(actor, 'UPDATE', 'user', id, {
      organizationId: item.organizationId,
      branchId: item.branchId,
      changes: { is_active: { from: !active, to: active } },
    });
  }

  async restore(user: RequestUser, actor: V2Actor, id: string): Promise<void> {
    const item = await this.findOwned(user, id, true);

    await this.setStatus(item, { deleted_at: null, status: UserStatus.ACTIVE });
    await this.audit.record(actor, 'UPDATE', 'user', id, {
      organizationId: item.organizationId,
      branchId: item.branchId,
      changes: { restored: true },
    });
  }

  // --- Ruxsatlar -----------------------------------------------------------

  async access(user: RequestUser, id: string) {
    const item = await this.findOwned(user, id);
    return { data: await this.accessView(item) };
  }

  async updateAccess(
    user: RequestUser,
    actor: V2Actor,
    id: string,
    payload: V2UpdateAccessDto,
    delegation: boolean,
  ) {
    const item = await this.findOwned(user, id);
    this.assertNotSelf(actor, item);
    if (item.role === 'owner' || item.role === 'dev') {
      throw new ForbiddenException('Egasi ruxsatlari o‘zgartirilmaydi');
    }
    this.assertManageable(actor, item.role);
    if (delegation && !isOwner(actor)) {
      throw new ForbiddenException('Topshirish huquqini faqat egasi beradi');
    }
    if (payload.version !== item.accessVersion) {
      throw new ConflictException('Ruxsatlar boshqa foydalanuvchi tomonidan o‘zgartirilgan');
    }

    const current = await this.currentAccess(item);
    const allowed = await this.delegable(actor);

    const next: StoredAccess = {
      grants: [...current.grants],
      delegations: [...current.delegations],
      branch_ids: [...current.branch_ids],
    };
    const target = delegation ? next.delegations : next.grants;

    for (const change of payload.scopes) {
      const branch = change.scope === 'company' ? null : (change.branchId ?? null);
      if (change.scope !== 'company' && !branch) {
        throw new BadRequestException('Filial doirasi uchun filial tanlanishi kerak');
      }
      const unknown = change.permissions.filter(
        (permission) => !ALL_PERMISSIONS.includes(permission),
      );
      if (unknown.length) {
        throw new BadRequestException(`Noma’lum ruxsat: ${unknown.join(', ')}`);
      }
      const denied = change.permissions.filter(
        (permission) => allowed && !allowed.has(permission),
      );
      if (denied.length) {
        throw new ForbiddenException(
          `Bu ruxsatlarni berish huquqingiz yo‘q: ${denied.join(', ')}`,
        );
      }

      for (let index = target.length - 1; index >= 0; index -= 1) {
        if (
          target[index].scope === change.scope &&
          (target[index].branch_id ?? null) === branch
        ) {
          target.splice(index, 1);
        }
      }
      target.push(
        ...[...new Set(change.permissions)].map((permission) => ({
          permission,
          scope: change.scope,
          branch_id: branch,
        })),
      );
    }

    if (!delegation && payload.branches?.length) {
      const memberships = new Set(next.branch_ids);
      for (const change of payload.branches) {
        if (change.active) memberships.add(change.branchId);
        else memberships.delete(change.branchId);
      }
      next.branch_ids = [...memberships];
    }

    const data = {
      accessVersion: item.accessVersion + 1,
      permissions: next as unknown as Prisma.InputJsonValue,
    };
    const updated =
      item.ref.kind === 'teacher'
        ? await this.prisma.teacher.updateMany({
            where: { id: item.ref.id, accessVersion: item.accessVersion },
            data,
          })
        : await this.prisma.user.updateMany({
            where: { id: item.ref.id, accessVersion: item.accessVersion },
            data,
          });
    if (!updated.count) {
      throw new ConflictException('Ruxsatlar boshqa foydalanuvchi tomonidan o‘zgartirilgan');
    }

    await this.audit.record(actor, 'UPDATE', 'user_access', id, {
      organizationId: item.organizationId,
      branchId: item.branchId,
      changes: { delegation, scopes: payload.scopes, branches: payload.branches ?? [] },
    });

    return this.access(user, id);
  }

  /** `GET /permissions` — ruxsatlar katalogi va filiallar. */
  async catalogue(user: RequestUser, actor: V2Actor) {
    const org = this.scope.org(user);
    const [branches, templates] = org
      ? await Promise.all([
          this.prisma.branch.findMany({
            where: { ...org, status: Status.ACTIVE },
            select: { id: true, name: true },
            orderBy: { id: 'asc' },
          }),
          actor.organizationId
            ? this.prisma.permissionTemplate.findMany({
                where: { organizationId: actor.organizationId },
                orderBy: { name: 'asc' },
              })
            : [],
        ])
      : [[], []];

    return {
      data: {
        own_resources: OWN_RESOURCES,
        permissions: ALL_PERMISSIONS,
        templates: ROLE_TEMPLATES,
        custom_templates: templates.map((row) => this.toTemplate(row)),
        branches: branches.map((branch) => ({
          id: toId(branch.id),
          name: branch.name,
        })),
        delegations: await this.actorDelegations(actor),
      },
    };
  }

  async createTemplate(actor: V2Actor, payload: V2PermissionTemplateDto) {
    if (!actor.organizationId) {
      throw new BadRequestException('Hisob tashkilotga biriktirilmagan');
    }
    const row = await uniqueGuard(
      () =>
        this.prisma.permissionTemplate.create({
          data: {
            organizationId: actor.organizationId as number,
            name: payload.name,
            permissions: this.cleanPermissions(payload.permissions),
          },
        }),
      'Bu nomdagi shablon allaqachon mavjud',
    );
    return { data: this.toTemplate(row) };
  }

  async updateTemplate(
    actor: V2Actor,
    id: number,
    payload: V2PermissionTemplateDto,
  ) {
    await this.ownedTemplate(actor, id);
    const row = await uniqueGuard(
      () =>
        this.prisma.permissionTemplate.update({
          where: { id },
          data: {
            name: payload.name,
            permissions: this.cleanPermissions(payload.permissions),
          },
        }),
      'Bu nomdagi shablon allaqachon mavjud',
    );
    return { data: this.toTemplate(row) };
  }

  async deleteTemplate(actor: V2Actor, id: number): Promise<void> {
    await this.ownedTemplate(actor, id);
    await this.prisma.permissionTemplate.delete({ where: { id } });
  }

  // --- Ichki yordamchilar --------------------------------------------------

  private async findStaff(
    org: OrgWhere,
    filters: {
      role?: V2Role;
      branchId: number | null;
      search?: string;
      isActive?: boolean;
      includeDeleted: boolean;
    },
  ): Promise<StaffItem[]> {
    const search = filters.search
      ? {
          OR: [
            { fullName: { contains: filters.search, mode: 'insensitive' as const } },
            { email: { contains: filters.search, mode: 'insensitive' as const } },
            { phone: { contains: filters.search.replace(/[\s()+-]/g, '') } },
          ],
        }
      : {};
    const status =
      filters.isActive === undefined
        ? {}
        : filters.isActive
          ? { status: UserStatus.ACTIVE }
          : { status: { not: UserStatus.ACTIVE } };
    const deleted = filters.includeDeleted ? {} : { deleted_at: null };

    const wantTeachers = !filters.role || filters.role === 'teacher';
    const userRole = filters.role ? USER_ROLE_OF[filters.role] : undefined;
    const wantUsers = !filters.role || Boolean(userRole);

    const [users, teachers] = await Promise.all([
      wantUsers
        ? this.prisma.user.findMany({
            where: {
              ...org,
              ...deleted,
              ...status,
              ...search,
              role: userRole
                ? userRole
                : {
                    in: [
                      Role.ADMIN,
                      Role.MANAGEMENT,
                      Role.ADMINSTRATOR,
                      Role.ACCOUNTANT,
                    ],
                  },
              ...(filters.branchId
                ? {
                    AND: [
                      {
                        OR: [
                          { branchId: filters.branchId },
                          { managedBranches: { some: { id: filters.branchId } } },
                        ],
                      },
                    ],
                  }
                : {}),
            },
            select: USER_SELECT,
          })
        : Promise.resolve([]),
      wantTeachers
        ? this.prisma.teacher.findMany({
            where: {
              ...org,
              ...deleted,
              ...status,
              ...search,
              ...(filters.branchId ? { branchId: filters.branchId } : {}),
            },
            select: TEACHER_SELECT,
          })
        : Promise.resolve([]),
    ]);

    return [
      ...users.map((row) => this.fromUser(row)),
      ...teachers.map((row) => this.fromTeacher(row)),
    ].sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id),
    );
  }

  private async findOwned(
    user: RequestUser,
    id: string,
    includeDeleted = false,
  ): Promise<StaffItem> {
    const ref = parseStaffId(id);
    const org = this.scope.org(user);
    if (!ref || !org) throw new NotFoundException('Xodim topilmadi');

    const deleted = includeDeleted ? {} : { deleted_at: null };
    if (ref.kind === 'teacher') {
      const row = await this.prisma.teacher.findFirst({
        where: { id: ref.id, ...org, ...deleted },
        select: TEACHER_SELECT,
      });
      if (!row) throw new NotFoundException('Xodim topilmadi');
      return this.fromTeacher(row);
    }

    const row = await this.prisma.user.findFirst({
      where: { id: ref.id, ...org, ...deleted },
      select: USER_SELECT,
    });
    if (!row || !toV2Role(row.role)) throw new NotFoundException('Xodim topilmadi');
    return this.fromUser(row);
  }

  private fromUser(row: Prisma.UserGetPayload<{ select: typeof USER_SELECT }>): StaffItem {
    const managed = row.managedBranches[0];
    return {
      ref: { kind: 'user', id: row.id },
      id: toId(row.id),
      name: row.fullName,
      email: row.email,
      phone: row.phone,
      avatar: row.photo,
      role: toV2Role(row.role) ?? 'operator',
      branchId: row.branchId ?? managed?.id ?? null,
      branchName: row.branch?.name ?? managed?.name ?? null,
      status: row.status,
      organizationId: row.organizationId,
      accessVersion: row.accessVersion,
      permissions: row.permissions,
      deletedAt: row.deleted_at,
      createdAt: row.created_at,
    };
  }

  private fromTeacher(
    row: Prisma.TeacherGetPayload<{ select: typeof TEACHER_SELECT }>,
  ): StaffItem {
    return {
      ref: { kind: 'teacher', id: row.id },
      id: toTeacherId(row.id),
      name: row.fullName,
      email: row.email,
      phone: row.phone,
      avatar: row.photo,
      role: 'teacher',
      branchId: row.branchId,
      branchName: row.branch?.name ?? null,
      specialization: row.specialization === 'PRACTICE' ? 'PRACTICE' : 'THEORY',
      status: row.status,
      organizationId: row.organizationId,
      accessVersion: row.accessVersion,
      permissions: row.permissions,
      deletedAt: row.deleted_at,
      createdAt: row.created_at,
    };
  }

  private toUser(item: StaffItem) {
    return {
      id: item.id,
      name: item.name,
      email: item.email ?? '',
      role: item.role,
      ...(item.phone.startsWith(NO_PHONE) ? {} : { phone: item.phone }),
      ...(item.avatar ? { avatar: item.avatar } : {}),
      branch_id: item.branchId ? toId(item.branchId) : null,
      ...(item.branchName ? { branch_name: item.branchName } : {}),
      ...(item.organizationId ? { company_id: toId(item.organizationId) } : {}),
      ...(item.specialization ? { specialization: item.specialization } : {}),
      is_active: item.status === UserStatus.ACTIVE && !item.deletedAt,
      created_at: item.createdAt.toISOString(),
      access_version: item.accessVersion,
      deleted_at: item.deletedAt?.toISOString() ?? null,
    };
  }

  /** Ro'yxat ustunlari: o'qituvchi va operator uchun umr bo'yi ko'rsatkichlar. */
  private async metrics(items: StaffItem[]) {
    const result = new Map<string, Record<string, number | null>>();
    const teacherIds = items
      .filter((item) => item.ref.kind === 'teacher')
      .map((item) => item.ref.id);
    const operatorIds = items
      .filter((item) => item.role === 'operator')
      .map((item) => item.ref.id);

    if (teacherIds.length) {
      const [lessons, memberships] = await Promise.all([
        this.prisma.lesson.findMany({
          where: {
            OR: [
              { teacherId: { in: teacherIds } },
              { group: { teacherId: { in: teacherIds } } },
            ],
          },
          select: { teacherId: true, group: { select: { teacherId: true } } },
        }),
        this.prisma.studentGroup.findMany({
          where: {
            status: Status.ACTIVE,
            student: { deleted_at: null },
            group: { teacherId: { in: teacherIds }, deleted_at: null },
          },
          select: { studentId: true, group: { select: { teacherId: true } } },
        }),
      ]);

      for (const id of teacherIds) {
        const students = new Set(
          memberships
            .filter((row) => row.group.teacherId === id)
            .map((row) => row.studentId),
        );
        result.set(toTeacherId(id), {
          lesson_count: lessons.filter(
            (row) => (row.group.teacherId ?? row.teacherId) === id,
          ).length,
          student_count: students.size,
        });
      }
    }

    if (operatorIds.length) {
      const registered = await this.prisma.student.findMany({
        where: { registeredById: { in: operatorIds }, deleted_at: null },
        select: {
          registeredById: true,
          _count: { select: { payments: { where: { status: 'PAID' } } } },
        },
      });

      for (const id of operatorIds) {
        const own = registered.filter((row) => row.registeredById === id);
        const paying = own.filter((row) => row._count.payments > 0).length;
        result.set(toId(id), {
          registered_students_count: own.length,
          payment_follow_through_rate: own.length
            ? percent(paying, own.length)
            : null,
        });
      }
    }

    return result;
  }

  /** Kartochkadagi bog'liq yozuvlar. */
  private async relations(item: StaffItem) {
    const [groups, registered, referred] = await Promise.all([
      item.ref.kind === 'teacher'
        ? this.prisma.group.findMany({
            where: { teacherId: item.ref.id, deleted_at: null },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          })
        : Promise.resolve([] as { id: number; name: string }[]),
      item.role === 'operator'
        ? this.prisma.student.findMany({
            where: { registeredById: item.ref.id, deleted_at: null },
            select: { id: true, fullName: true },
            orderBy: { created_at: 'desc' },
            take: 50,
          })
        : Promise.resolve([] as { id: number; fullName: string }[]),
      this.prisma.student.count({
        where: { referredByUserId: item.id, deleted_at: null },
      }),
    ]);

    return {
      ...(item.ref.kind === 'teacher'
        ? { groups: groups.map((row) => ({ id: toId(row.id), name: row.name })) }
        : {}),
      ...(item.role === 'operator'
        ? {
            registered_students: registered.map((row) => ({
              id: toId(row.id),
              name: row.fullName,
            })),
          }
        : {}),
      referred_students_count: referred,
    };
  }

  private async setStatus(
    item: StaffItem,
    data: { status?: UserStatus; deleted_at?: Date | null },
  ) {
    if (item.ref.kind === 'teacher') {
      await this.prisma.teacher.update({ where: { id: item.ref.id }, data });
    } else {
      await this.prisma.user.update({ where: { id: item.ref.id }, data });
    }
  }

  /** Hali sozlanmagan xodimning joriy (rol bo'yicha) holati. */
  private async currentAccess(item: StaffItem): Promise<StoredAccess> {
    if (item.accessVersion > 0) return parseStoredAccess(item.permissions);

    const branches = item.organizationId
      ? await this.prisma.branch.findMany({
          where: { organizationId: item.organizationId, status: Status.ACTIVE },
          select: { id: true },
        })
      : [];
    const scope: PermissionAssignment['scope'] =
      item.branchId && item.role !== 'accountant' ? 'branch' : 'company';

    return {
      grants: (ROLE_TEMPLATES[item.role] ?? []).map((permission) => ({
        permission,
        scope,
        branch_id: scope === 'branch' ? toId(item.branchId as number) : null,
      })),
      delegations: [],
      branch_ids: branches.map((branch) => toId(branch.id)),
    };
  }

  private async accessView(item: StaffItem) {
    const access = await this.currentAccess(item);
    return {
      access_version: item.accessVersion,
      branch_ids: access.branch_ids,
      permissions: access.grants,
      delegations: access.delegations,
    };
  }

  /** Aktor bera oladigan ruxsatlar (`null` — cheklov yo'q, egasi). */
  private async delegable(actor: V2Actor): Promise<Set<string> | null> {
    if (isOwner(actor)) return null;
    const delegations = await this.actorDelegations(actor);
    return new Set(delegations.map((grant) => grant.permission));
  }

  private async actorDelegations(
    actor: V2Actor,
  ): Promise<PermissionAssignment[]> {
    if (isOwner(actor)) {
      return ALL_PERMISSIONS.map((permission) => ({
        permission,
        scope: 'company' as const,
        branch_id: null,
      }));
    }

    if (actor.ref.kind === 'user') {
      const row = await this.prisma.user.findUnique({
        where: { id: actor.ref.id },
        select: { accessVersion: true, permissions: true },
      });
      if (row && row.accessVersion > 0) {
        const stored = parseStoredAccess(row.permissions);
        if (stored.delegations.length) return stored.delegations;
      }
    }

    if (actor.role !== 'manager') return [];

    // Menejer standart holatda operator va o'qituvchi huquqlarini o'z
    // filiali doirasida topshira oladi.
    const branch = actor.homeBranchId ? toId(actor.homeBranchId) : null;
    return [...new Set([...ROLE_TEMPLATES.operator, ...ROLE_TEMPLATES.teacher])].map(
      (permission) => ({
        permission,
        scope: branch ? ('branch' as const) : ('company' as const),
        branch_id: branch,
      }),
    );
  }

  private cleanPermissions(permissions: string[]) {
    return [...new Set(permissions)].filter((permission) =>
      ALL_PERMISSIONS.includes(permission),
    );
  }

  private async ownedTemplate(actor: V2Actor, id: number) {
    const row = actor.organizationId
      ? await this.prisma.permissionTemplate.findFirst({
          where: { id, organizationId: actor.organizationId },
          select: { id: true },
        })
      : null;
    if (!row) throw new NotFoundException('Shablon topilmadi');
  }

  private toTemplate(row: {
    id: number;
    name: string;
    permissions: string[];
    created_at: Date;
    updated_at: Date;
  }) {
    return {
      id: toId(row.id),
      name: row.name,
      permissions: row.permissions,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }

  private assertManageable(actor: V2Actor, role: V2Role) {
    if (!MANAGEABLE[actor.role].includes(role)) {
      throw new ForbiddenException('Bu roldagi xodimni boshqara olmaysiz');
    }
  }

  private assertNotSelf(actor: V2Actor, item: StaffItem) {
    if (actor.ref.kind === item.ref.kind && actor.ref.id === item.ref.id) {
      throw new BadRequestException('O‘z hisobingizga bu amalni qo‘llab bo‘lmaydi');
    }
  }
}

const isOwner = (actor: V2Actor) => actor.role === 'owner' || actor.role === 'dev';
