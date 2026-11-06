import { Injectable } from '@nestjs/common';
import { Prisma, Role, Status, UserStatus } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import type { V2Actor } from '../common/v2-auth.guard';
import { V2BalanceService } from '../common/v2-balance.service';
import { V2ScopeService } from '../common/v2-scope.service';
import { digitsOf } from '../common/v2-where';
import {
  fromV2CourseType,
  splitName,
  toId,
  toTeacherId,
  toV2CourseType,
  toV2Role,
} from '../common/v2.mapper';
import type { V2WriteOptionsQueryDto } from './v2-users.dto';

type OptionKind =
  | 'courses'
  | 'groups'
  | 'custodians'
  | 'teachers'
  | 'students'
  | 'programs'
  | 'stations'
  | 'vehicles'
  | 'questions'
  | 'enrollments';

/** Qaysi yozish formasi qaysi tanlovlarni ko'radi. */
const OPTIONS: Record<string, OptionKind[]> = {
  students: ['courses', 'groups'],
  groups: ['teachers'],
  courses: [],
  lessons: ['groups'],
  schedule: ['groups'],
  attendance: ['groups'],
  payments: ['students'],
  leads: ['groups', 'custodians'],
  vehicles: ['custodians'],
  vehicle_documents: [],
  vehicle_maintenance: [],
  vehicle_transfers: [],
  vehicle_inspections: ['vehicles', 'custodians'],
  fuel: ['vehicles', 'stations'],
  fuel_stations: [],
  expenses: ['vehicles', 'teachers'],
  training_programs: ['courses'],
  training_enrollments: ['students', 'programs'],
  driving_sessions: ['enrollments', 'vehicles', 'teachers'],
  questions: [],
  test_templates: ['questions', 'groups', 'students'],
  test_assignments: ['groups', 'students'],
};

const DEFAULT_LIMIT = 50;

/**
 * Yozish formalari uchun minimal tanlovlar (`GET /permissions/options`).
 * Faqat ruxsatlari qo'lda sozlangan xodimlar ishlatadi.
 */
@Injectable()
export class V2OptionsService {
  constructor(
    private prisma: PrismaService,
    private scope: V2ScopeService,
    private balances: V2BalanceService,
  ) {}

  async options(
    user: RequestUser,
    actor: V2Actor,
    query: V2WriteOptionsQueryDto,
  ) {
    const org = this.scope.org(user);
    if (!org) return { data: { branches: [] } };

    const branchId = query.branchId
      ? (await this.scope.writeBranch(user, actor, null, query.branchId))
          .branchId
      : null;
    const kinds = OPTIONS[query.resource] ?? [];
    const limit = query.limit ?? DEFAULT_LIMIT;
    const branch = branchId ? { branchId } : {};

    const branches = await this.prisma.branch.findMany({
      where: { ...org, status: Status.ACTIVE },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });
    const result: Record<string, unknown> = {
      branches: branches.map((row) => ({ id: toId(row.id), name: row.name })),
    };

    await Promise.all(
      kinds.map(async (kind) => {
        switch (kind) {
          case 'courses': {
            const rows = await this.prisma.course.findMany({
              where: {
                ...org,
                deleted_at: null,
                status: Status.ACTIVE,
                ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : {}),
              },
              orderBy: { name: 'asc' },
            });
            result.courses = rows.map((row) => ({
              id: toId(row.id),
              name: row.name,
              branch_id: row.branchId ? toId(row.branchId) : '',
              course_type: toV2CourseType(row.type),
              price: row.price.toNumber(),
              duration_days: row.durationDays ?? row.durationMonth * 30,
              is_active: true,
            }));
            break;
          }
          case 'groups': {
            const rows = await this.prisma.group.findMany({
              where: { ...org, ...branch, deleted_at: null },
              select: {
                id: true,
                name: true,
                branchId: true,
                courseType: true,
                status: true,
                branch: { select: { name: true } },
              },
              orderBy: { name: 'asc' },
            });
            result.groups = rows.map((row) => ({
              id: toId(row.id),
              name: row.name,
              branch_id: row.branchId ? toId(row.branchId) : '',
              ...(row.branch ? { branch_name: row.branch.name } : {}),
              course_type: toV2CourseType(row.courseType),
              is_active: row.status === Status.ACTIVE,
            }));
            break;
          }
          case 'teachers': {
            const rows = await this.prisma.teacher.findMany({
              where: {
                ...org,
                ...branch,
                deleted_at: null,
                status: UserStatus.ACTIVE,
              },
              select: {
                id: true,
                fullName: true,
                branchId: true,
                specialization: true,
              },
              orderBy: { fullName: 'asc' },
            });
            result.teachers = rows.map((row) => ({
              id: toTeacherId(row.id),
              name: row.fullName,
              branch_id: row.branchId ? toId(row.branchId) : '',
              specialization:
                row.specialization === 'PRACTICE' ? 'PRACTICE' : 'THEORY',
            }));
            break;
          }
          case 'custodians': {
            const [teachers, users] = await Promise.all([
              this.prisma.teacher.findMany({
                where: {
                  ...org,
                  ...branch,
                  deleted_at: null,
                  status: UserStatus.ACTIVE,
                },
                select: { id: true, fullName: true },
                orderBy: { fullName: 'asc' },
              }),
              this.prisma.user.findMany({
                where: {
                  ...org,
                  deleted_at: null,
                  status: UserStatus.ACTIVE,
                  role: {
                    in: [Role.ADMIN, Role.MANAGEMENT, Role.ADMINSTRATOR],
                  },
                },
                select: { id: true, fullName: true, role: true },
                orderBy: { fullName: 'asc' },
              }),
            ]);
            result.custodians = [
              ...teachers.map((row) => ({
                id: toTeacherId(row.id),
                name: row.fullName,
                role: 'teacher',
              })),
              ...users.map((row) => ({
                id: toId(row.id),
                name: row.fullName,
                role: toV2Role(row.role) ?? 'operator',
              })),
            ];
            break;
          }
          case 'students': {
            const where: Prisma.StudentWhereInput = {
              ...org,
              ...branch,
              deleted_at: null,
              ...(query.course_type
                ? { courseType: fromV2CourseType(query.course_type) }
                : {}),
              ...(query.search
                ? {
                    OR: [
                      {
                        fullName: {
                          contains: query.search,
                          mode: 'insensitive',
                        },
                      },
                      ...(/^\d{3,}$/.test(digitsOf(query.search))
                        ? [{ phone: { contains: digitsOf(query.search) } }]
                        : []),
                    ],
                  }
                : {}),
            };
            const [total, rows] = await Promise.all([
              this.prisma.student.count({ where }),
              this.prisma.student.findMany({
                where,
                select: {
                  id: true,
                  fullName: true,
                  firstName: true,
                  lastName: true,
                  phone: true,
                  branchId: true,
                  courseType: true,
                  studentGroups: {
                    where: { status: Status.ACTIVE },
                    select: { group: { select: { name: true } } },
                    take: 1,
                  },
                },
                orderBy: { fullName: 'asc' },
                take: limit,
              }),
            ]);
            const balances = await this.balances.forStudents(
              rows.map((row) => row.id),
            );
            result.students_total = total;
            result.students = rows.map((row) => {
              const name = splitName(row.fullName);
              const balance = balances.get(row.id);
              return {
                id: toId(row.id),
                first_name: row.firstName ?? name.first,
                last_name: row.lastName ?? name.last,
                branch_id: row.branchId ? toId(row.branchId) : '',
                ...(row.courseType
                  ? { course_type: toV2CourseType(row.courseType) }
                  : {}),
                group_name: row.studentGroups[0]?.group.name ?? null,
                phone_last4: row.phone.slice(-4),
                total_price: balance?.totalPrice.toNumber() ?? 0,
                amount_paid: balance?.paid.toNumber() ?? 0,
              };
            });
            break;
          }
          case 'programs': {
            const rows = await this.prisma.trainingProgram.findMany({
              where: { ...org, ...branch, isActive: true },
              orderBy: { name: 'asc' },
            });
            result.programs = rows.map((row) => ({
              id: toId(row.id),
              name: row.name,
              branch_id: toId(row.branchId),
              required_minutes: row.requiredMinutes,
              category: row.category,
            }));
            break;
          }
          case 'stations': {
            const rows = await this.prisma.fuelStation.findMany({
              where: { ...org, ...branch, active: true },
              orderBy: { name: 'asc' },
            });
            result.stations = rows.map((row) => ({
              id: toId(row.id),
              name: row.name,
              branch_id: toId(row.branchId),
              stir: row.stir,
            }));
            break;
          }
          case 'vehicles': {
            const rows = await this.prisma.vehicle.findMany({
              where: { ...org, ...branch, status: { not: 'retired' } },
              orderBy: { plateNumber: 'asc' },
            });
            result.vehicles = rows.map((row) => ({
              id: toId(row.id),
              plate_number: row.plateNumber,
              branch_id: toId(row.branchId),
              current_custodian_id: row.currentCustodianId,
              model: row.model,
              fuel_types: row.fuelTypes,
              available_for_booking: row.status === 'active',
              categories: row.categories,
            }));
            break;
          }
          case 'questions': {
            const rows = await this.prisma.question.findMany({
              where: {
                status: 'published',
                OR: [{ visibility: 'platform_public' }, { ...org }],
              },
              select: { id: true, topic: true, visibility: true },
              orderBy: { id: 'desc' },
              take: 500,
            });
            result.questions = rows.map((row) => ({
              id: toId(row.id),
              topic: row.topic,
              visibility: row.visibility,
            }));
            break;
          }
          case 'enrollments': {
            const rows = await this.prisma.trainingEnrollment.findMany({
              where: { ...org, ...branch, status: 'active' },
              select: {
                id: true,
                studentId: true,
                program: { select: { id: true, name: true } },
              },
              orderBy: { id: 'desc' },
              take: 500,
            });
            const students = await this.prisma.student.findMany({
              where: { id: { in: rows.map((row) => row.studentId) } },
              select: { id: true, fullName: true, firstName: true, lastName: true },
            });
            const byId = new Map(students.map((row) => [row.id, row]));
            result.enrollments = rows.map((row) => {
              const student = byId.get(row.studentId);
              const name = splitName(student?.fullName ?? '');
              return {
                id: toId(row.id),
                student: {
                  id: toId(row.studentId),
                  first_name: student?.firstName ?? name.first,
                  last_name: student?.lastName ?? name.last,
                },
                program: row.program
                  ? { id: toId(row.program.id), title: row.program.name }
                  : null,
              };
            });
            break;
          }
        }
      }),
    );

    return { data: result };
  }
}
