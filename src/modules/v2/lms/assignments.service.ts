import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Status } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import type { V2Actor } from '../common/v2-auth.guard';
import { V2AuditService } from '../common/v2-audit.service';
import { V2FilesService, type UploadedBlob } from '../common/v2-files.service';
import { pageOf, paginated } from '../common/v2-pagination';
import { iso, optionalId, toId } from '../common/v2.mapper';
import { LmsAccessService } from './lms-access.service';
import { LmsCurriculumService, MATERIAL_MIME_TYPES } from './curriculum.service';
import type {
  AssignmentsQueryDto,
  CreateAssignmentDto,
  CreateSubmissionDto,
  GradeSubmissionDto,
  UpdateAssignmentDto,
} from './lms.dto';

const include = {
  course: { select: { name: true } },
  group: { select: { name: true } },
  _count: { select: { submissions: true } },
} as const;

type AssignmentRow = Prisma.AssignmentGetPayload<{ include: typeof include }>;

@Injectable()
export class LmsAssignmentsService {
  constructor(
    private prisma: PrismaService,
    private access: LmsAccessService,
    private curriculum: LmsCurriculumService,
    private files: V2FilesService,
    private audit: V2AuditService,
  ) {}

  async list(user: RequestUser, actor: V2Actor, query: AssignmentsQueryDto) {
    const { page, limit, skip, take } = pageOf(query);
    const org = this.access.orgWhere(user);
    if (!org) return paginated([], 0, page, limit);

    const teacherGroups = await this.access.teacherGroupIds(actor);
    const courseId = optionalId(query.course_id);
    const groupId = optionalId(query.group_id);
    const where: Prisma.AssignmentWhereInput = {
      ...org,
      deleted_at: null,
      ...(courseId ? { courseId } : {}),
      ...(groupId ? { groupId } : {}),
      ...(teacherGroups ? { groupId: { in: teacherGroups } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? { title: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.assignment.count({ where }),
      this.prisma.assignment.findMany({
        where,
        include,
        orderBy: [{ created_at: query.order ?? 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
    ]);
    const graded = await this.gradedCounts(rows.map((row) => row.id));
    return paginated(
      rows.map((row) => toAssignment(row, graded.get(row.id) ?? 0)),
      total,
      page,
      limit,
    );
  }

  async detail(user: RequestUser, actor: V2Actor, id: number) {
    const row = await this.find(user, actor, id);
    const graded = await this.gradedCounts([id]);
    return { data: toAssignment(row, graded.get(id) ?? 0) };
  }

  async create(
    user: RequestUser,
    actor: V2Actor,
    payload: CreateAssignmentDto,
    branchId: number | null,
  ) {
    const organizationId = await this.access.writeOrg(user, branchId);
    const group = await this.access.group(organizationId, payload.group_id, actor);
    const course =
      (await this.access.course(organizationId, payload.course_id)) ??
      (group?.courseId ? { id: group.courseId } : null);
    if (!group && !course) {
      throw new BadRequestException('Kurs yoki guruhni tanlang');
    }
    if (group && course && group.courseId && group.courseId !== course.id) {
      throw new BadRequestException('Guruh tanlangan kursga tegishli emas');
    }
    await this.access.assertCanEdit(actor, group?.id ?? null);

    const row = await this.prisma.assignment.create({
      data: {
        organizationId,
        title: payload.title,
        description: payload.description || null,
        courseId: course?.id ?? null,
        groupId: group?.id ?? null,
        dueDate: payload.due_date ? new Date(payload.due_date) : null,
        maxScore: payload.max_score ?? 100,
        status: payload.status ?? 'published',
        createdById: actor.id,
        createdByName: actor.name,
      },
      include,
    });
    await this.audit.record(actor, 'CREATE', 'assignment', row.id, {
      organizationId,
      changes: { title: row.title },
    });
    return { data: toAssignment(row, 0) };
  }

  async update(
    user: RequestUser,
    actor: V2Actor,
    id: number,
    payload: UpdateAssignmentDto,
  ) {
    const before = await this.find(user, actor, id);
    await this.access.assertCanEdit(actor, before.groupId);
    const row = await this.prisma.assignment.update({
      where: { id },
      data: {
        ...(payload.title !== undefined ? { title: payload.title } : {}),
        ...(payload.description !== undefined
          ? { description: payload.description || null }
          : {}),
        ...(payload.due_date !== undefined
          ? { dueDate: payload.due_date ? new Date(payload.due_date) : null }
          : {}),
        ...(payload.max_score !== undefined ? { maxScore: payload.max_score } : {}),
        ...(payload.status !== undefined ? { status: payload.status } : {}),
      },
      include,
    });
    await this.audit.record(actor, 'UPDATE', 'assignment', id, {
      organizationId: row.organizationId,
      changes: { ...payload },
    });
    const graded = await this.gradedCounts([id]);
    return { data: toAssignment(row, graded.get(id) ?? 0) };
  }

  async remove(user: RequestUser, actor: V2Actor, id: number): Promise<void> {
    const row = await this.find(user, actor, id);
    await this.access.assertCanEdit(actor, row.groupId);
    await this.prisma.assignment.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
    await this.audit.record(actor, 'DELETE', 'assignment', id, {
      organizationId: row.organizationId,
      changes: { title: row.title },
    });
  }

  /** Topshirishi kerak bo'lgan har bir o'quvchi — topshirgan yoki yo'q. */
  async submissions(user: RequestUser, actor: V2Actor, id: number) {
    const assignment = await this.find(user, actor, id);
    const expected = await this.expectedStudents(assignment);
    const rows = await this.prisma.assignmentSubmission.findMany({
      where: { assignmentId: id },
      include: { student: { select: { fullName: true } } },
    });
    const byStudent = new Map(rows.map((row) => [row.studentId, row]));
    const students = await this.prisma.student.findMany({
      where: { id: { in: [...new Set([...expected, ...byStudent.keys()])] } },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });

    return {
      data: students.map((student) => {
        const row = byStudent.get(student.id);
        const late =
          !!row && !!assignment.dueDate && row.submittedAt > assignment.dueDate;
        return {
          id: row ? toId(row.id) : null,
          assignment_id: toId(id),
          student_id: toId(student.id),
          student_name: student.fullName,
          status: row?.status ?? 'missing',
          text: row?.text ?? null,
          has_file: !!row?.fileId,
          file_name: row?.fileName ?? null,
          score: row?.score ?? null,
          max_score: assignment.maxScore,
          feedback: row?.feedback ?? null,
          late,
          submitted_at: iso(row?.submittedAt),
          graded_at: iso(row?.gradedAt),
          graded_by_name: row?.gradedByName ?? null,
        };
      }),
    };
  }

  /** Xodim o'quvchi nomidan javobni qayd etadi (qog'oz yoki chatdan kelgan ish). */
  async submit(
    user: RequestUser,
    actor: V2Actor,
    id: number,
    payload: CreateSubmissionDto,
    file: UploadedBlob | undefined,
  ) {
    const assignment = await this.find(user, actor, id);
    if (assignment.status === 'closed') {
      throw new BadRequestException('Topshiriq yopilgan');
    }
    const student = await this.access.student(assignment.organizationId, payload.student_id);
    const expected = await this.expectedStudents(assignment);
    if (!expected.includes(student.id)) {
      throw new BadRequestException('O‘quvchi bu topshiriq guruhida emas');
    }
    if (!file && !payload.text?.trim()) {
      throw new BadRequestException('Javob matni yoki fayl kiritilishi shart');
    }
    const stored = file
      ? await this.files.save(file, assignment.organizationId, MATERIAL_MIME_TYPES)
      : null;
    const fileName = file
      ? ((file as { originalname?: string }).originalname ?? 'javob').slice(0, 200)
      : null;

    const data = {
      text: payload.text?.trim() || null,
      ...(stored ? { fileId: stored.id, fileName } : {}),
      status: 'submitted',
      submittedAt: new Date(),
      score: null,
      gradedAt: null,
      gradedByName: null,
    };
    await this.prisma.assignmentSubmission.upsert({
      where: { assignmentId_studentId: { assignmentId: id, studentId: student.id } },
      update: data,
      create: { assignmentId: id, studentId: student.id, ...data },
    });
    return this.submissions(user, actor, id);
  }

  async grade(
    user: RequestUser,
    actor: V2Actor,
    submissionId: number,
    payload: GradeSubmissionDto,
  ) {
    const org = this.access.orgWhere(user);
    const row = org
      ? await this.prisma.assignmentSubmission.findFirst({
          where: { id: submissionId, assignment: { ...org, deleted_at: null } },
          include: { assignment: true },
        })
      : null;
    if (!row) throw new NotFoundException('Javob topilmadi');
    await this.access.assertCanEdit(actor, row.assignment.groupId);
    if (payload.score > row.assignment.maxScore) {
      throw new BadRequestException(
        `Ball ${row.assignment.maxScore} dan oshmasligi kerak`,
      );
    }
    await this.prisma.assignmentSubmission.update({
      where: { id: submissionId },
      data: {
        score: payload.score,
        feedback: payload.feedback ?? null,
        status: payload.status ?? 'graded',
        gradedAt: new Date(),
        gradedByName: actor.name,
      },
    });
    await this.audit.record(actor, 'UPDATE', 'assignment_submission', submissionId, {
      organizationId: row.assignment.organizationId,
      changes: { score: payload.score },
    });
    return this.submissions(user, actor, row.assignmentId);
  }

  async downloadSubmission(user: RequestUser, actor: V2Actor, submissionId: number) {
    const org = this.access.orgWhere(user);
    const row = org
      ? await this.prisma.assignmentSubmission.findFirst({
          where: { id: submissionId, assignment: { ...org } },
          include: { assignment: { select: { groupId: true } } },
        })
      : null;
    if (!row?.fileId) throw new NotFoundException('Fayl topilmadi');
    const teacherGroups = await this.access.teacherGroupIds(actor);
    if (teacherGroups && !teacherGroups.includes(row.assignment.groupId ?? -1)) {
      throw new NotFoundException('Fayl topilmadi');
    }
    return this.files.stream(row.fileId);
  }

  private async expectedStudents(assignment: {
    groupId: number | null;
    courseId: number | null;
  }): Promise<number[]> {
    if (assignment.groupId) {
      const rows = await this.prisma.studentGroup.findMany({
        where: {
          groupId: assignment.groupId,
          status: Status.ACTIVE,
          student: { deleted_at: null },
        },
        select: { studentId: true },
      });
      return rows.map((row) => row.studentId);
    }
    return assignment.courseId ? this.curriculum.enrolledIds(assignment.courseId) : [];
  }

  private async gradedCounts(ids: number[]) {
    if (!ids.length) return new Map<number, number>();
    const rows = await this.prisma.assignmentSubmission.groupBy({
      by: ['assignmentId'],
      where: { assignmentId: { in: ids }, status: 'graded' },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.assignmentId, row._count._all]));
  }

  private async find(user: RequestUser, actor: V2Actor, id: number) {
    const org = this.access.orgWhere(user);
    const row = org
      ? await this.prisma.assignment.findFirst({
          where: { id, ...org, deleted_at: null },
          include,
        })
      : null;
    if (!row) throw new NotFoundException('Topshiriq topilmadi');
    const teacherGroups = await this.access.teacherGroupIds(actor);
    if (teacherGroups && !teacherGroups.includes(row.groupId ?? -1)) {
      throw new NotFoundException('Topshiriq topilmadi');
    }
    return row;
  }
}

function toAssignment(row: AssignmentRow, gradedCount: number) {
  return {
    id: toId(row.id),
    title: row.title,
    description: row.description,
    course_id: row.courseId ? toId(row.courseId) : null,
    course_name: row.course?.name ?? null,
    group_id: row.groupId ? toId(row.groupId) : null,
    group_name: row.group?.name ?? null,
    due_date: iso(row.dueDate),
    max_score: row.maxScore,
    status: row.status,
    overdue: !!row.dueDate && row.dueDate < new Date() && row.status !== 'closed',
    submissions_count: row._count.submissions,
    graded_count: gradedCount,
    created_by_name: row.createdByName,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
