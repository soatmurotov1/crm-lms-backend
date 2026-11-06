import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentMethod, Prisma, Status, UserStatus } from '@prisma/client';
import { hashPassword } from 'src/common/bcrypt/bcrypt';
import { PrismaService } from 'src/common/prisma/prisma.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import { generateRandomPassword } from 'src/common/utils/password.util';
import type { V2Actor } from '../common/v2-auth.guard';
import { V2AuditService, diff } from '../common/v2-audit.service';
import {
  V2BalanceService,
  studentCourseTypeWhere,
} from '../common/v2-balance.service';
import { uniqueGuard } from '../common/v2-errors';
import { V2LedgerService } from '../common/v2-ledger.service';
import { pageOf, paginated } from '../common/v2-pagination';
import { V2ScopeService, type OrgWhere } from '../common/v2-scope.service';
import { V2StaffService } from '../common/v2-staff.service';
import { dateFromKey, dayRange, digitsOf } from '../common/v2-where';
import {
  fromV2CourseType,
  fromV2PaymentMethod,
  joinName,
  optionalId,
  parseStaffId,
} from '../common/v2.mapper';
import type {
  V2CreateStudentDto,
  V2StudentsQueryDto,
  V2UpdateStudentDto,
} from './v2-students.dto';
import {
  STUDENT_SELECT,
  V2StudentMapper,
  type StudentRow,
} from './v2-students.mapper';

const DUPLICATE_PHONE = 'Bu telefon raqamli o‘quvchi allaqachon mavjud';

/** Frontend holati → eski panel holati (o'quvchi portaliga kirish). */
const LEGACY_STATUS: Record<string, UserStatus> = {
  active: UserStatus.ACTIVE,
  completed: UserStatus.INACTIVE,
  dropped: UserStatus.INACTIVE,
  suspended: UserStatus.FREEZE,
};

@Injectable()
export class V2StudentsService {
  constructor(
    private prisma: PrismaService,
    private scope: V2ScopeService,
    private mapper: V2StudentMapper,
    private balances: V2BalanceService,
    private ledger: V2LedgerService,
    private staff: V2StaffService,
    private audit: V2AuditService,
  ) {}

  async list(
    user: RequestUser,
    actor: V2Actor,
    query: V2StudentsQueryDto,
    headerBranchId: number | null,
  ) {
    const { page, limit, skip } = pageOf(query);
    const { org, branchId } = await this.scope.read(
      user,
      actor,
      headerBranchId,
      query.branch_id,
    );
    if (!org) return paginated([], 0, page, limit);

    if (query.include_deleted && !isOwner(actor)) {
      throw new ForbiddenException();
    }

    const where = this.listWhere(org, branchId, actor, query);
    const order = query.sort_order ?? 'desc';

    // Narx va qarz hisoblanadigan qiymat — saralash va filtr xotirada.
    if (
      query.has_debt !== undefined ||
      query.sort_by === 'debt' ||
      query.sort_by === 'total_price'
    ) {
      const { balances } = await this.balances.load(where);
      const filtered =
        query.has_debt === undefined
          ? balances
          : balances.filter(
              (balance) => balance.debt.greaterThan(0) === query.has_debt,
            );
      const sign = order === 'asc' ? 1 : -1;
      const key = query.sort_by === 'total_price' ? 'totalPrice' : 'debt';
      const sorted =
        query.sort_by === 'debt' || query.sort_by === 'total_price'
          ? [...filtered].sort(
              (a, b) =>
                sign * a[key].comparedTo(b[key]) || b.studentId - a.studentId,
            )
          : [...filtered].sort(
              (a, b) =>
                sign * (a.since.getTime() - b.since.getTime()) ||
                b.studentId - a.studentId,
            );
      const ids = sorted.slice(skip, skip + limit).map((row) => row.studentId);
      const rows = await this.prisma.student.findMany({
        where: { id: { in: ids } },
        select: STUDENT_SELECT,
      });
      const byId = new Map(rows.map((row) => [row.id, row]));
      const ordered = ids.flatMap((id) => {
        const row = byId.get(id);
        return row ? [row] : [];
      });

      return paginated(
        await this.mapper.many(ordered, actor),
        sorted.length,
        page,
        limit,
      );
    }

    const orderBy: Prisma.StudentOrderByWithRelationInput[] =
      query.sort_by === 'first_name'
        ? [{ firstName: order }, { fullName: order }]
        : query.sort_by === 'last_name'
          ? [{ lastName: order }, { fullName: order }]
          : [{ created_at: order }];

    const [total, rows] = await Promise.all([
      this.prisma.student.count({ where }),
      this.prisma.student.findMany({
        where,
        select: STUDENT_SELECT,
        orderBy: [...orderBy, { id: 'desc' }],
        skip,
        take: limit,
      }),
    ]);

    return paginated(await this.mapper.many(rows, actor), total, page, limit);
  }

  async detail(user: RequestUser, actor: V2Actor, id: number) {
    const row = await this.findOwned(user, actor, id);
    const [student, referrals] = await Promise.all([
      this.mapper.one(row, actor),
      this.prisma.student.count({
        where: { referredByStudentId: id, deleted_at: null },
      }),
    ]);

    return { data: { ...student, referrals_count: referrals } };
  }

  async create(
    user: RequestUser,
    actor: V2Actor,
    payload: V2CreateStudentDto,
    headerBranchId: number | null,
  ) {
    const { branchId, organizationId } = await this.scope.writeBranch(
      user,
      actor,
      headerBranchId,
      payload.branch_id,
    );
    const links = await this.resolveLinks(organizationId, payload);
    const registeredById =
      links.registeredById ?? (actor.ref.kind === 'user' ? actor.ref.id : null);

    // Tezkor kursda boshlang'ich to'lov `amount_paid`, avto maktabda
    // `initial_payment` maydonida keladi.
    const firstPayment =
      payload.course_type === 'tezkor'
        ? (payload.amount_paid ?? 0)
        : (payload.initial_payment ?? payload.amount_paid ?? 0);
    const method = fromV2PaymentMethod(payload.payment_method) ?? PaymentMethod.CASH;
    const password = await hashPassword(
      payload.learner_password ?? generateRandomPassword(16),
    );

    const id = await uniqueGuard(
      () =>
        this.prisma.$transaction(async (tx) => {
          const student = await tx.student.create({
            data: {
              fullName: joinName(payload.first_name, payload.last_name),
              firstName: payload.first_name,
              lastName: payload.last_name,
              middleName: payload.middle_name || null,
              phone: payload.phone,
              email: payload.email || null,
              password,
              hasLearnerAccount: Boolean(payload.learner_password),
              birth_date: payload.birth_date
                ? dateFromKey(payload.birth_date)
                : null,
              gender: payload.gender ?? null,
              address: payload.address || null,
              passportSeries: payload.passport_series || null,
              passportNumber: payload.passport_number || null,
              organizationId,
              branchId,
              courseType: fromV2CourseType(payload.course_type),
              courseId: links.courseId,
              totalPrice: payload.total_price,
              paymentMethod: method,
              lifecycle: payload.status ?? 'active',
              status: LEGACY_STATUS[payload.status ?? 'active'],
              result: payload.result ?? 'oqimoqda',
              hasDocument: payload.has_document ?? false,
              o83: payload.o83 ?? false,
              contractNumber: payload.contract_number || null,
              notes: payload.notes || null,
              startDate: payload.start_date
                ? dateFromKey(payload.start_date)
                : null,
              completionDate: payload.completion_date
                ? dateFromKey(payload.completion_date)
                : null,
              leadSource: payload.lead_source ?? null,
              leadSourceOther: payload.lead_source_other || null,
              referredByStudentId: links.referredByStudentId,
              referredByUserId: links.referredByUserId,
              registeredById,
            },
            select: { id: true },
          });

          if (links.groupId) {
            await tx.studentGroup.create({
              data: {
                studentId: student.id,
                groupId: links.groupId,
                userId: actor.ref.kind === 'user' ? actor.ref.id : null,
              },
            });
          }

          if (firstPayment > 0) {
            await this.ledger.record(
              actor,
              {
                studentId: student.id,
                amount: firstPayment,
                method,
                idempotencyKey: payload.idempotency_key ?? null,
              },
              tx,
            );
          }

          return student.id;
        }),
      DUPLICATE_PHONE,
    );

    await this.audit.record(actor, 'CREATE', 'student', id, {
      organizationId,
      branchId,
      changes: {
        name: joinName(payload.first_name, payload.last_name),
        phone: payload.phone,
        total_price: payload.total_price,
        initial_payment: firstPayment,
      },
    });

    return this.detail(user, actor, id);
  }

  async update(
    user: RequestUser,
    actor: V2Actor,
    id: number,
    payload: V2UpdateStudentDto,
  ) {
    const before = await this.findOwned(user, actor, id);
    const organizationId = before.organizationId ?? actor.organizationId;
    if (!organizationId) throw new NotFoundException('O‘quvchi topilmadi');

    const links = await this.resolveLinks(organizationId, payload);
    const branchId =
      payload.branch_id !== undefined
        ? (await this.scope.writeBranch(user, actor, null, payload.branch_id))
            .branchId
        : undefined;
    const firstName = payload.first_name ?? before.firstName;
    const lastName = payload.last_name ?? before.lastName;
    const method = fromV2PaymentMethod(payload.payment_method);

    await uniqueGuard(
      () =>
        this.prisma.$transaction(async (tx) => {
          await tx.student.update({
            where: { id },
            data: {
              ...(payload.first_name !== undefined ||
              payload.last_name !== undefined
                ? {
                    firstName,
                    lastName,
                    fullName: joinName(firstName, lastName) || before.fullName,
                  }
                : {}),
              ...(payload.middle_name !== undefined
                ? { middleName: payload.middle_name || null }
                : {}),
              ...(payload.phone !== undefined ? { phone: payload.phone } : {}),
              ...(payload.email !== undefined
                ? { email: payload.email || null }
                : {}),
              ...(payload.birth_date !== undefined
                ? { birth_date: dateFromKey(payload.birth_date) }
                : {}),
              ...(payload.gender !== undefined ? { gender: payload.gender } : {}),
              ...(payload.address !== undefined
                ? { address: payload.address || null }
                : {}),
              ...(payload.passport_series !== undefined
                ? { passportSeries: payload.passport_series || null }
                : {}),
              ...(payload.passport_number !== undefined
                ? { passportNumber: payload.passport_number || null }
                : {}),
              ...(branchId !== undefined ? { branchId } : {}),
              ...(payload.course_type
                ? { courseType: fromV2CourseType(payload.course_type) }
                : {}),
              ...(links.courseId !== undefined
                ? { courseId: links.courseId }
                : {}),
              ...(payload.total_price !== undefined
                ? { totalPrice: payload.total_price }
                : {}),
              ...(method ? { paymentMethod: method } : {}),
              ...(payload.status
                ? {
                    lifecycle: payload.status,
                    status: LEGACY_STATUS[payload.status],
                  }
                : {}),
              ...(payload.result ? { result: payload.result } : {}),
              ...(payload.has_document !== undefined
                ? { hasDocument: payload.has_document }
                : {}),
              ...(payload.o83 !== undefined ? { o83: payload.o83 } : {}),
              ...(payload.contract_number !== undefined
                ? { contractNumber: payload.contract_number || null }
                : {}),
              ...(payload.notes !== undefined
                ? { notes: payload.notes || null }
                : {}),
              ...(payload.start_date !== undefined
                ? { startDate: dateFromKey(payload.start_date) }
                : {}),
              ...(payload.completion_date !== undefined
                ? { completionDate: dateFromKey(payload.completion_date) }
                : {}),
              ...(payload.lead_source !== undefined
                ? { leadSource: payload.lead_source }
                : {}),
              ...(payload.lead_source_other !== undefined
                ? { leadSourceOther: payload.lead_source_other || null }
                : {}),
              ...(links.referredByStudentId !== undefined
                ? { referredByStudentId: links.referredByStudentId }
                : {}),
              ...(links.referredByUserId !== undefined
                ? { referredByUserId: links.referredByUserId }
                : {}),
              ...(links.registeredById !== undefined
                ? { registeredById: links.registeredById }
                : {}),
              ...(payload.learner_password
                ? {
                    password: await hashPassword(payload.learner_password),
                    hasLearnerAccount: true,
                  }
                : {}),
            },
          });

          if (payload.group_id !== undefined) {
            await this.moveToGroup(tx, actor, id, links.groupId ?? null);
          }

          // Tahrirlashda `amount_paid` — QO'SHIMCHA to'lov.
          if (payload.amount_paid && payload.amount_paid > 0) {
            await this.ledger.record(
              actor,
              {
                studentId: id,
                amount: payload.amount_paid,
                method: method ?? before.paymentMethod ?? PaymentMethod.CASH,
                idempotencyKey: payload.idempotency_key ?? null,
              },
              tx,
            );
          }
        }),
      DUPLICATE_PHONE,
    );

    const result = await this.detail(user, actor, id);
    const beforeView = await this.mapper.one(before, actor);
    await this.audit.record(actor, 'UPDATE', 'student', id, {
      organizationId,
      branchId: branchId ?? before.branchId,
      changes: diff(beforeView, result.data),
    });

    return result;
  }

  async remove(user: RequestUser, actor: V2Actor, id: number): Promise<void> {
    const row = await this.findOwned(user, actor, id);

    await this.prisma.student.update({
      where: { id },
      data: { deleted_at: new Date(), status: UserStatus.INACTIVE },
    });
    await this.audit.record(actor, 'DELETE', 'student', id, {
      organizationId: row.organizationId,
      branchId: row.branchId,
      changes: { name: row.fullName, phone: row.phone },
    });
  }

  async restore(user: RequestUser, actor: V2Actor, id: number): Promise<void> {
    const row = await this.findOwned(user, actor, id, true);

    await this.prisma.student.update({
      where: { id },
      data: {
        deleted_at: null,
        status: LEGACY_STATUS[row.lifecycle] ?? UserStatus.ACTIVE,
      },
    });
    await this.audit.record(actor, 'UPDATE', 'student', id, {
      organizationId: row.organizationId,
      branchId: row.branchId,
      changes: { restored: true },
    });
  }

  async upsertLearnerAccount(
    user: RequestUser,
    actor: V2Actor,
    id: number,
    password: string,
  ) {
    const row = await this.findOwned(user, actor, id);

    await this.prisma.student.update({
      where: { id },
      data: { password: await hashPassword(password), hasLearnerAccount: true },
    });
    await this.audit.record(actor, 'UPDATE', 'student', id, {
      organizationId: row.organizationId,
      branchId: row.branchId,
      changes: { learner_account: 'updated' },
    });

    return { data: { has_learner_account: true as const } };
  }

  /** O'quvchi ko'rinadigan doira (o'qituvchi — faqat o'z guruhlaridagilar). */
  teacherWhere(actor: V2Actor): Prisma.StudentWhereInput {
    return actor.ref.kind === 'teacher'
      ? {
          studentGroups: {
            some: {
              status: Status.ACTIVE,
              group: { teacherId: actor.ref.id, deleted_at: null },
            },
          },
        }
      : {};
  }

  async findOwned(
    user: RequestUser,
    actor: V2Actor,
    id: number,
    includeDeleted = false,
  ): Promise<StudentRow> {
    const org = this.scope.org(user);
    const row = org
      ? await this.prisma.student.findFirst({
          where: {
            id,
            ...org,
            ...(includeDeleted ? {} : { deleted_at: null }),
            ...this.teacherWhere(actor),
          },
          select: STUDENT_SELECT,
        })
      : null;

    if (!row) throw new NotFoundException('O‘quvchi topilmadi');
    return row;
  }

  private listWhere(
    org: OrgWhere,
    branchId: number | null,
    actor: V2Actor,
    query: V2StudentsQueryDto,
  ): Prisma.StudentWhereInput {
    const and: Prisma.StudentWhereInput[] = [this.teacherWhere(actor)];
    const courseType = fromV2CourseType(query.course_type);
    if (courseType) and.push(studentCourseTypeWhere(courseType));

    if (query.search) {
      const contains = { contains: query.search, mode: 'insensitive' as const };
      const digits = digitsOf(query.search);
      and.push({
        OR: [
          { fullName: contains },
          { firstName: contains },
          { lastName: contains },
          ...(/^\d{3,}$/.test(digits) ? [{ phone: { contains: digits } }] : []),
        ],
      });
    }

    if (query.has_group !== undefined) {
      const active = {
        status: Status.ACTIVE,
        group: { status: Status.ACTIVE, deleted_at: null },
      };
      and.push(
        query.has_group
          ? { studentGroups: { some: active } }
          : { studentGroups: { none: active } },
      );
    }

    const created = dayRange(query.date_from, query.date_to);
    const courseId = optionalId(query.course_id);
    const operatorId = optionalId(query.operator_id);
    const referrerStudent = optionalId(query.referred_by_student_id);

    return {
      ...org,
      ...(query.include_deleted ? {} : { deleted_at: null }),
      ...(branchId ? { branchId } : {}),
      ...(created ? { created_at: created } : {}),
      ...(courseId !== undefined ? { courseId: courseId ?? -1 } : {}),
      ...(operatorId !== undefined ? { registeredById: operatorId ?? -1 } : {}),
      ...(referrerStudent !== undefined
        ? { referredByStudentId: referrerStudent ?? -1 }
        : {}),
      ...(query.referred_by_user_id
        ? { referredByUserId: query.referred_by_user_id }
        : {}),
      ...(query.status ? { lifecycle: query.status } : {}),
      AND: and,
    };
  }

  /**
   * Bog'liq yozuvlar (kurs, guruh, tavsiya qilgan, operator) shu tashkilotga
   * tegishli ekanini tekshiradi. `undefined` — maydon yuborilmagan.
   */
  private async resolveLinks(
    organizationId: number,
    payload: {
      course_id?: string;
      group_id?: string;
      referred_by_student_id?: string;
      referred_by_user_id?: string;
      registered_by?: string;
    },
  ) {
    const courseId = optionalId(payload.course_id);
    const groupId =
      payload.group_id === undefined
        ? undefined
        : payload.group_id === ''
          ? null
          : optionalId(payload.group_id);
    const studentId = optionalId(payload.referred_by_student_id);
    const operatorId = optionalId(payload.registered_by);

    if (courseId === null || (groupId === null && payload.group_id)) {
      throw new BadRequestException('Kurs yoki guruh noto‘g‘ri');
    }

    const [course, group, referrer, operator, staff] = await Promise.all([
      courseId
        ? this.prisma.course.findFirst({
            where: { id: courseId, organizationId, deleted_at: null },
            select: { id: true },
          })
        : null,
      groupId
        ? this.prisma.group.findFirst({
            where: { id: groupId, organizationId, deleted_at: null },
            select: { id: true },
          })
        : null,
      studentId
        ? this.prisma.student.findFirst({
            where: { id: studentId, organizationId },
            select: { id: true },
          })
        : null,
      operatorId
        ? this.prisma.user.findFirst({
            where: { id: operatorId, organizationId },
            select: { id: true },
          })
        : null,
      payload.referred_by_user_id
        ? this.staff.findInOrg(payload.referred_by_user_id, organizationId)
        : null,
    ]);

    if (courseId && !course) throw new BadRequestException('Kurs topilmadi');
    if (groupId && !group) throw new BadRequestException('Guruh topilmadi');
    if (studentId && !referrer) {
      throw new BadRequestException('Tavsiya qilgan o‘quvchi topilmadi');
    }
    if (operatorId && !operator) {
      throw new BadRequestException('Operator topilmadi');
    }
    if (
      payload.referred_by_user_id &&
      (!staff || !parseStaffId(payload.referred_by_user_id))
    ) {
      throw new BadRequestException('Tavsiya qilgan xodim topilmadi');
    }

    return {
      courseId: courseId === undefined ? undefined : courseId,
      groupId,
      referredByStudentId: studentId === undefined ? undefined : studentId,
      referredByUserId:
        payload.referred_by_user_id === undefined
          ? undefined
          : payload.referred_by_user_id || null,
      registeredById: operatorId === undefined ? undefined : operatorId,
    };
  }

  /** O'quvchini boshqa guruhga o'tkazadi (`null` — guruhdan chiqaradi). */
  private async moveToGroup(
    tx: Prisma.TransactionClient,
    actor: V2Actor,
    studentId: number,
    groupId: number | null,
  ) {
    await tx.studentGroup.updateMany({
      where: {
        studentId,
        status: Status.ACTIVE,
        ...(groupId ? { groupId: { not: groupId } } : {}),
      },
      data: { status: Status.INACTIVE },
    });

    if (!groupId) return;

    await tx.studentGroup.upsert({
      where: { groupId_studentId: { groupId, studentId } },
      create: {
        groupId,
        studentId,
        userId: actor.ref.kind === 'user' ? actor.ref.id : null,
      },
      update: { status: Status.ACTIVE },
    });
  }
}

const isOwner = (actor: V2Actor) => actor.role === 'owner' || actor.role === 'dev';
