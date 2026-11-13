import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Status, type QuizQuestion } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import type { V2Actor } from '../common/v2-auth.guard';
import { V2AuditService } from '../common/v2-audit.service';
import { pageOf, paginated } from '../common/v2-pagination';
import { iso, optionalId, percent, toId } from '../common/v2.mapper';
import { LmsAccessService } from './lms-access.service';
import { LmsCurriculumService } from './curriculum.service';
import type {
  CreateQuizDto,
  QuestionDto,
  QuizzesQueryDto,
  ReviewAttemptDto,
  SubmitAttemptDto,
  UpdateQuizDto,
} from './lms.dto';

const include = {
  course: { select: { name: true } },
  group: { select: { name: true } },
  _count: { select: { questions: true, attempts: true } },
} as const;

type QuizRow = Prisma.QuizGetPayload<{ include: typeof include }>;
type Answer = number | number[] | string;

/** Bitta savolni baholash. `null` — avtomatik baholab bo'lmaydi (qo'lda). */
export function scoreQuestion(question: Pick<QuizQuestion, 'type' | 'correct' | 'points'>, answer: Answer | undefined): number | null {
  const correct = Array.isArray(question.correct) ? (question.correct as unknown[]) : [];
  if (answer === undefined || answer === null || answer === '') return 0;

  if (question.type === 'text') {
    if (!correct.length) return null;
    const given = String(answer).trim().toLowerCase();
    return correct.some((value) => String(value).trim().toLowerCase() === given)
      ? question.points
      : 0;
  }
  if (question.type === 'single') {
    const given = Array.isArray(answer) ? answer[0] : Number(answer);
    return Number(given) === Number(correct[0]) ? question.points : 0;
  }
  const given = (Array.isArray(answer) ? answer : [answer]).map(Number).sort();
  const expected = correct.map(Number).sort();
  return given.length === expected.length && given.every((v, i) => v === expected[i])
    ? question.points
    : 0;
}

@Injectable()
export class LmsQuizzesService {
  constructor(
    private prisma: PrismaService,
    private access: LmsAccessService,
    private curriculum: LmsCurriculumService,
    private audit: V2AuditService,
  ) {}

  async list(user: RequestUser, actor: V2Actor, query: QuizzesQueryDto) {
    const { page, limit, skip, take } = pageOf(query);
    const org = this.access.orgWhere(user);
    if (!org) return paginated([], 0, page, limit);

    const teacherGroups = await this.access.teacherGroupIds(actor);
    const courseId = optionalId(query.course_id);
    const groupId = optionalId(query.group_id);
    const where: Prisma.QuizWhereInput = {
      ...org,
      deleted_at: null,
      ...(courseId ? { courseId } : {}),
      ...(groupId ? { groupId } : {}),
      ...(teacherGroups ? { groupId: { in: teacherGroups } } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.quiz.count({ where }),
      this.prisma.quiz.findMany({
        where,
        include,
        orderBy: [{ created_at: query.order ?? 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
    ]);
    const stats = await this.stats(rows.map((row) => row.id));
    return paginated(rows.map((row) => toQuiz(row, stats.get(row.id))), total, page, limit);
  }

  async detail(user: RequestUser, actor: V2Actor, id: number) {
    const row = await this.find(user, actor, id);
    const questions = await this.prisma.quizQuestion.findMany({
      where: { quizId: id },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
    const stats = await this.stats([id]);
    return {
      data: {
        ...toQuiz(row, stats.get(id)),
        questions: questions.map(toQuestion),
      },
    };
  }

  async create(user: RequestUser, actor: V2Actor, payload: CreateQuizDto, branchId: number | null) {
    const organizationId = await this.access.writeOrg(user, branchId);
    const group = await this.access.group(organizationId, payload.group_id, actor);
    const course =
      (await this.access.course(organizationId, payload.course_id)) ??
      (group?.courseId ? { id: group.courseId } : null);
    if (!group && !course) throw new BadRequestException('Kurs yoki guruhni tanlang');
    if (group && course && group.courseId && group.courseId !== course.id) {
      throw new BadRequestException('Guruh tanlangan kursga tegishli emas');
    }
    await this.access.assertCanEdit(actor, group?.id ?? null);
    if (payload.status === 'published') {
      throw new BadRequestException('Avval savollar qo‘shing, keyin e’lon qiling');
    }
    this.assertWindow(payload.starts_at, payload.ends_at);

    const row = await this.prisma.quiz.create({
      data: {
        organizationId,
        title: payload.title,
        description: payload.description || null,
        kind: payload.kind ?? 'quiz',
        courseId: course?.id ?? null,
        groupId: group?.id ?? null,
        durationMin: payload.duration_min ?? null,
        passPercent: payload.pass_percent ?? 60,
        maxAttempts: payload.max_attempts ?? 1,
        startsAt: payload.starts_at ? new Date(payload.starts_at) : null,
        endsAt: payload.ends_at ? new Date(payload.ends_at) : null,
        status: payload.status ?? 'draft',
        createdByName: actor.name,
      },
      include,
    });
    await this.audit.record(actor, 'CREATE', 'quiz', row.id, {
      organizationId,
      changes: { title: row.title, kind: row.kind },
    });
    return { data: toQuiz(row, undefined) };
  }

  async update(user: RequestUser, actor: V2Actor, id: number, payload: UpdateQuizDto) {
    const before = await this.find(user, actor, id);
    await this.access.assertCanEdit(actor, before.groupId);
    if (payload.status === 'published' && before._count.questions === 0) {
      throw new BadRequestException('Savolsiz testni e’lon qilib bo‘lmaydi');
    }
    this.assertWindow(
      payload.starts_at === undefined ? iso(before.startsAt) : payload.starts_at,
      payload.ends_at === undefined ? iso(before.endsAt) : payload.ends_at,
    );
    const date = (value: string | null | undefined) =>
      value === undefined ? undefined : value ? new Date(value) : null;
    const row = await this.prisma.quiz.update({
      where: { id },
      data: {
        ...(payload.title !== undefined ? { title: payload.title } : {}),
        ...(payload.description !== undefined ? { description: payload.description || null } : {}),
        ...(payload.duration_min !== undefined ? { durationMin: payload.duration_min } : {}),
        ...(payload.pass_percent !== undefined ? { passPercent: payload.pass_percent } : {}),
        ...(payload.max_attempts !== undefined ? { maxAttempts: payload.max_attempts } : {}),
        ...(payload.starts_at !== undefined ? { startsAt: date(payload.starts_at) } : {}),
        ...(payload.ends_at !== undefined ? { endsAt: date(payload.ends_at) } : {}),
        ...(payload.status !== undefined ? { status: payload.status } : {}),
      },
      include,
    });
    await this.audit.record(actor, 'UPDATE', 'quiz', id, {
      organizationId: row.organizationId,
      changes: { ...payload },
    });
    const stats = await this.stats([id]);
    return { data: toQuiz(row, stats.get(id)) };
  }

  async remove(user: RequestUser, actor: V2Actor, id: number): Promise<void> {
    const row = await this.find(user, actor, id);
    await this.access.assertCanEdit(actor, row.groupId);
    await this.prisma.quiz.update({ where: { id }, data: { deleted_at: new Date() } });
    await this.audit.record(actor, 'DELETE', 'quiz', id, {
      organizationId: row.organizationId,
      changes: { title: row.title },
    });
  }

  // --- Savollar -------------------------------------------------------------------

  async addQuestion(user: RequestUser, actor: V2Actor, quizId: number, payload: QuestionDto) {
    const quiz = await this.find(user, actor, quizId);
    await this.access.assertCanEdit(actor, quiz.groupId);
    const clean = validateQuestion(payload);
    const row = await this.prisma.quizQuestion.create({
      data: {
        quizId,
        ...clean,
        position: payload.position ?? quiz._count.questions,
      },
    });
    return { data: toQuestion(row) };
  }

  async updateQuestion(
    user: RequestUser,
    actor: V2Actor,
    quizId: number,
    questionId: number,
    payload: QuestionDto,
  ) {
    const quiz = await this.find(user, actor, quizId);
    await this.access.assertCanEdit(actor, quiz.groupId);
    await this.question(quizId, questionId);
    const row = await this.prisma.quizQuestion.update({
      where: { id: questionId },
      data: {
        ...validateQuestion(payload),
        ...(payload.position !== undefined ? { position: payload.position } : {}),
      },
    });
    return { data: toQuestion(row) };
  }

  async removeQuestion(user: RequestUser, actor: V2Actor, quizId: number, questionId: number) {
    const quiz = await this.find(user, actor, quizId);
    await this.access.assertCanEdit(actor, quiz.groupId);
    await this.question(quizId, questionId);
    await this.prisma.quizQuestion.delete({ where: { id: questionId } });
  }

  // --- Urinishlar va natijalar ------------------------------------------------------

  async submitAttempt(user: RequestUser, actor: V2Actor, quizId: number, payload: SubmitAttemptDto) {
    const quiz = await this.find(user, actor, quizId);
    if (quiz.status !== 'published') {
      throw new BadRequestException('Test e’lon qilinmagan yoki yopilgan');
    }
    const now = new Date();
    if ((quiz.startsAt && now < quiz.startsAt) || (quiz.endsAt && now > quiz.endsAt)) {
      throw new BadRequestException('Test topshirish vaqti emas');
    }
    const student = await this.access.student(quiz.organizationId, payload.student_id);
    const expected = await this.expectedStudents(quiz);
    if (!expected.includes(student.id)) {
      throw new BadRequestException('O‘quvchi bu test guruhida emas');
    }
    const used = await this.prisma.quizAttempt.count({
      where: { quizId, studentId: student.id },
    });
    if (used >= quiz.maxAttempts) {
      throw new BadRequestException('Urinishlar soni tugagan');
    }

    const questions = await this.prisma.quizQuestion.findMany({ where: { quizId } });
    let score = 0;
    let needsReview = false;
    const maxScore = questions.reduce((sum, q) => sum + q.points, 0);
    const detail: Record<string, { answer: Answer | null; points: number | null }> = {};
    for (const question of questions) {
      const answer = payload.answers[String(question.id)];
      const points = scoreQuestion(question, answer);
      if (points === null) needsReview = true;
      score += points ?? 0;
      detail[String(question.id)] = { answer: answer ?? null, points };
    }
    const pct = percent(score, maxScore);
    const row = await this.prisma.quizAttempt.create({
      data: {
        quizId,
        studentId: student.id,
        answers: detail as Prisma.InputJsonValue,
        score,
        maxScore,
        percent: pct,
        passed: pct >= quiz.passPercent,
        status: needsReview ? 'needs_review' : 'graded',
        submittedAt: now,
      },
      include: { student: { select: { fullName: true } } },
    });
    await this.audit.record(actor, 'CREATE', 'quiz_attempt', row.id, {
      organizationId: quiz.organizationId,
      changes: { quiz: quiz.title, student: student.fullName, score },
    });
    return { data: toAttempt(row, used + 1) };
  }

  async results(user: RequestUser, actor: V2Actor, quizId: number) {
    const quiz = await this.find(user, actor, quizId);
    const expected = await this.expectedStudents(quiz);
    const attempts = await this.prisma.quizAttempt.findMany({
      where: { quizId },
      include: { student: { select: { fullName: true } } },
      orderBy: [{ submittedAt: 'asc' }],
    });
    // Har o'quvchining eng yaxshi urinishi.
    const best = new Map<number, (typeof attempts)[number]>();
    const count = new Map<number, number>();
    for (const row of attempts) {
      count.set(row.studentId, (count.get(row.studentId) ?? 0) + 1);
      const prev = best.get(row.studentId);
      if (!prev || row.percent > prev.percent) best.set(row.studentId, row);
    }
    const students = await this.prisma.student.findMany({
      where: { id: { in: [...new Set([...expected, ...best.keys()])] } },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
    const graded = [...best.values()];
    return {
      data: {
        summary: {
          expected: students.length,
          attempted: best.size,
          passed: graded.filter((row) => row.passed).length,
          average_percent: graded.length
            ? Math.round((graded.reduce((s, r) => s + r.percent, 0) / graded.length) * 10) / 10
            : null,
        },
        results: students.map((student) => {
          const row = best.get(student.id);
          return row
            ? toAttempt(row, count.get(student.id) ?? 1)
            : {
                id: null,
                quiz_id: toId(quizId),
                student_id: toId(student.id),
                student_name: student.fullName,
                status: 'not_started',
                score: null,
                max_score: null,
                percent: null,
                passed: null,
                attempts_used: 0,
                feedback: null,
                submitted_at: null,
              };
        }),
      },
    };
  }

  async review(user: RequestUser, actor: V2Actor, attemptId: number, payload: ReviewAttemptDto) {
    const org = this.access.orgWhere(user);
    const row = org
      ? await this.prisma.quizAttempt.findFirst({
          where: { id: attemptId, quiz: { ...org, deleted_at: null } },
          include: { quiz: true },
        })
      : null;
    if (!row) throw new NotFoundException('Natija topilmadi');
    await this.access.assertCanEdit(actor, row.quiz.groupId);
    if (payload.score > row.maxScore) {
      throw new BadRequestException(`Ball ${row.maxScore} dan oshmasligi kerak`);
    }
    const pct = percent(payload.score, row.maxScore);
    const updated = await this.prisma.quizAttempt.update({
      where: { id: attemptId },
      data: {
        score: payload.score,
        percent: pct,
        passed: pct >= row.quiz.passPercent,
        status: 'graded',
        feedback: payload.feedback ?? null,
        gradedByName: actor.name,
      },
      include: { student: { select: { fullName: true } } },
    });
    return { data: toAttempt(updated, 1) };
  }

  // --- Yordamchilar -------------------------------------------------------------------

  async expectedStudents(quiz: { groupId: number | null; courseId: number | null }) {
    if (quiz.groupId) {
      const rows = await this.prisma.studentGroup.findMany({
        where: { groupId: quiz.groupId, status: Status.ACTIVE, student: { deleted_at: null } },
        select: { studentId: true },
      });
      return rows.map((row) => row.studentId);
    }
    return quiz.courseId ? this.curriculum.enrolledIds(quiz.courseId) : [];
  }

  private assertWindow(start?: string | null, end?: string | null) {
    if (start && end && new Date(end) <= new Date(start)) {
      throw new BadRequestException('Tugash vaqti boshlanishdan keyin bo‘lsin');
    }
  }

  private async question(quizId: number, id: number) {
    const row = await this.prisma.quizQuestion.findFirst({ where: { id, quizId } });
    if (!row) throw new NotFoundException('Savol topilmadi');
    return row;
  }

  private async stats(ids: number[]) {
    const map = new Map<number, { attempted: number; average: number | null; passed: number }>();
    if (!ids.length) return map;
    const rows = await this.prisma.quizAttempt.groupBy({
      by: ['quizId'],
      where: { quizId: { in: ids } },
      _avg: { percent: true },
      _count: { studentId: true },
    });
    const passed = await this.prisma.quizAttempt.groupBy({
      by: ['quizId'],
      where: { quizId: { in: ids }, passed: true },
      _count: { _all: true },
    });
    const passedOf = new Map(passed.map((row) => [row.quizId, row._count._all]));
    for (const row of rows) {
      map.set(row.quizId, {
        attempted: row._count.studentId,
        average: row._avg.percent !== null ? Math.round(row._avg.percent * 10) / 10 : null,
        passed: passedOf.get(row.quizId) ?? 0,
      });
    }
    return map;
  }

  private async find(user: RequestUser, actor: V2Actor, id: number): Promise<QuizRow> {
    const org = this.access.orgWhere(user);
    const row = org
      ? await this.prisma.quiz.findFirst({ where: { id, ...org, deleted_at: null }, include })
      : null;
    if (!row) throw new NotFoundException('Test topilmadi');
    const teacherGroups = await this.access.teacherGroupIds(actor);
    if (teacherGroups && !teacherGroups.includes(row.groupId ?? -1)) {
      throw new NotFoundException('Test topilmadi');
    }
    return row;
  }
}

function validateQuestion(payload: QuestionDto) {
  const options = (payload.options ?? []).map((value) => value.trim()).filter(Boolean);
  if (payload.type === 'text') {
    const correct = payload.correct.map((value) => String(value).trim()).filter(Boolean);
    return { text: payload.text, type: payload.type, options: [], correct, points: payload.points ?? 1 };
  }
  if (options.length < 2) {
    throw new BadRequestException('Kamida 2 ta variant kiriting');
  }
  const correct = [...new Set(payload.correct.map(Number))];
  if (!correct.length || correct.some((i) => !Number.isInteger(i) || i < 0 || i >= options.length)) {
    throw new BadRequestException('To‘g‘ri javob variantlardan biri bo‘lishi kerak');
  }
  if (payload.type === 'single' && correct.length !== 1) {
    throw new BadRequestException('Bitta javobli savolda faqat bitta to‘g‘ri variant bo‘ladi');
  }
  return { text: payload.text, type: payload.type, options, correct, points: payload.points ?? 1 };
}

function toQuestion(row: QuizQuestion) {
  return {
    id: toId(row.id),
    quiz_id: toId(row.quizId),
    text: row.text,
    type: row.type,
    options: Array.isArray(row.options) ? row.options : [],
    correct: Array.isArray(row.correct) ? row.correct : [],
    points: row.points,
    position: row.position,
  };
}

function toQuiz(
  row: QuizRow,
  stats: { attempted: number; average: number | null; passed: number } | undefined,
) {
  return {
    id: toId(row.id),
    title: row.title,
    description: row.description,
    kind: row.kind,
    course_id: row.courseId ? toId(row.courseId) : null,
    course_name: row.course?.name ?? null,
    group_id: row.groupId ? toId(row.groupId) : null,
    group_name: row.group?.name ?? null,
    duration_min: row.durationMin,
    pass_percent: row.passPercent,
    max_attempts: row.maxAttempts,
    starts_at: iso(row.startsAt),
    ends_at: iso(row.endsAt),
    status: row.status,
    questions_count: row._count.questions,
    attempts_count: row._count.attempts,
    average_percent: stats?.average ?? null,
    passed_count: stats?.passed ?? 0,
    created_by_name: row.createdByName,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

function toAttempt(
  row: Prisma.QuizAttemptGetPayload<{ include: { student: { select: { fullName: true } } } }>,
  attemptsUsed: number,
) {
  return {
    id: toId(row.id),
    quiz_id: toId(row.quizId),
    student_id: toId(row.studentId),
    student_name: row.student.fullName,
    status: row.status,
    score: row.score,
    max_score: row.maxScore,
    percent: row.percent,
    passed: row.passed,
    attempts_used: attemptsUsed,
    feedback: row.feedback,
    submitted_at: iso(row.submittedAt),
  };
}
