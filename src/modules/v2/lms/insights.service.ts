import { Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceStatus, Status, UserStatus } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import type { V2Actor } from '../common/v2-auth.guard';
import { paginateArray } from '../common/v2-pagination';
import { iso, optionalId, percent, toId } from '../common/v2.mapper';
import { LmsAccessService } from './lms-access.service';
import { LmsCurriculumService } from './curriculum.service';
import type { GradesQueryDto } from './lms.dto';

const avg = (values: number[]) =>
  values.length
    ? Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10
    : null;

/** Baholar jurnali, o'quvchi/kurs progressi va LMS dashboard. */
@Injectable()
export class LmsInsightsService {
  constructor(
    private prisma: PrismaService,
    private access: LmsAccessService,
    private curriculum: LmsCurriculumService,
  ) {}

  /** Topshiriq va test baholari bitta jurnalda (eng yangisi birinchi). */
  async grades(user: RequestUser, actor: V2Actor, query: GradesQueryDto) {
    const org = this.access.orgWhere(user);
    if (!org) return paginateArray([], query);
    const teacherGroups = await this.access.teacherGroupIds(actor);
    const studentId = optionalId(query.student_id) ?? undefined;
    const groupId = optionalId(query.group_id) ?? undefined;
    const courseId = optionalId(query.course_id) ?? undefined;
    const parent = {
      ...org,
      deleted_at: null,
      ...(groupId ? { groupId } : {}),
      ...(courseId ? { courseId } : {}),
      ...(teacherGroups ? { groupId: { in: teacherGroups } } : {}),
    };

    const [submissions, attempts] = await Promise.all([
      query.source === 'quiz'
        ? []
        : this.prisma.assignmentSubmission.findMany({
            where: {
              status: 'graded',
              ...(studentId ? { studentId } : {}),
              assignment: parent,
            },
            include: {
              student: { select: { fullName: true } },
              assignment: {
                select: {
                  id: true,
                  title: true,
                  maxScore: true,
                  group: { select: { name: true } },
                  course: { select: { name: true } },
                },
              },
            },
            orderBy: { gradedAt: 'desc' },
            take: 1000,
          }),
      query.source === 'assignment'
        ? []
        : this.prisma.quizAttempt.findMany({
            where: {
              status: 'graded',
              ...(studentId ? { studentId } : {}),
              quiz: parent,
            },
            include: {
              student: { select: { fullName: true } },
              quiz: {
                select: {
                  id: true,
                  title: true,
                  kind: true,
                  group: { select: { name: true } },
                  course: { select: { name: true } },
                },
              },
            },
            orderBy: { submittedAt: 'desc' },
            take: 1000,
          }),
    ]);

    const rows = [
      ...submissions.map((row) => ({
        id: `a${row.id}`,
        source: 'assignment' as const,
        source_id: toId(row.assignment.id),
        title: row.assignment.title,
        student_id: toId(row.studentId),
        student_name: row.student.fullName,
        group_name: row.assignment.group?.name ?? null,
        course_name: row.assignment.course?.name ?? null,
        score: row.score ?? 0,
        max_score: row.assignment.maxScore,
        percent: percent(row.score ?? 0, row.assignment.maxScore),
        passed: null as boolean | null,
        graded_by_name: row.gradedByName,
        date: iso(row.gradedAt ?? row.submittedAt),
      })),
      ...attempts.map((row) => ({
        id: `q${row.id}`,
        source: 'quiz' as const,
        source_id: toId(row.quiz.id),
        title: row.quiz.title,
        student_id: toId(row.studentId),
        student_name: row.student.fullName,
        group_name: row.quiz.group?.name ?? null,
        course_name: row.quiz.course?.name ?? null,
        score: row.score,
        max_score: row.maxScore,
        percent: row.percent,
        passed: row.passed as boolean | null,
        graded_by_name: row.gradedByName,
        date: iso(row.submittedAt),
      })),
    ].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

    return {
      ...paginateArray(rows, query, 50),
      summary: {
        count: rows.length,
        average_percent: avg(rows.map((row) => row.percent)),
      },
    };
  }

  async studentProgress(user: RequestUser, studentId: number) {
    const org = this.access.orgWhere(user);
    const student = org
      ? await this.prisma.student.findFirst({
          where: { id: studentId, ...org, deleted_at: null },
          select: { id: true, fullName: true, courseId: true },
        })
      : null;
    if (!student) throw new NotFoundException('O‘quvchi topilmadi');

    const memberships = await this.prisma.studentGroup.findMany({
      where: { studentId, status: Status.ACTIVE, group: { deleted_at: null } },
      select: { groupId: true, group: { select: { courseId: true } } },
    });
    const groupIds = memberships.map((row) => row.groupId);
    const courseIds = [
      ...new Set(
        [student.courseId, ...memberships.map((row) => row.group.courseId)].filter(
          (id): id is number => !!id,
        ),
      ),
    ];

    const [attendance, assignments, submissions, attempts, courses] = await Promise.all([
      this.prisma.attendance.groupBy({
        by: ['status'],
        where: { studentId },
        _count: { _all: true },
      }),
      this.prisma.assignment.count({
        where: {
          deleted_at: null,
          status: { not: 'draft' },
          OR: [
            { groupId: { in: groupIds } },
            { groupId: null, courseId: { in: courseIds } },
          ],
        },
      }),
      this.prisma.assignmentSubmission.findMany({
        where: { studentId, assignment: { deleted_at: null } },
        select: { status: true, score: true, assignment: { select: { maxScore: true } } },
      }),
      this.prisma.quizAttempt.findMany({
        where: { studentId, quiz: { deleted_at: null } },
        select: { quizId: true, percent: true, passed: true, status: true },
      }),
      this.prisma.course.findMany({
        where: { id: { in: courseIds } },
        select: { id: true, name: true },
      }),
    ]);

    const attendanceTotal = attendance.reduce((sum, row) => sum + row._count._all, 0);
    const attended = attendance
      .filter((row) => row.status === AttendanceStatus.PRESENT || row.status === AttendanceStatus.LATE)
      .reduce((sum, row) => sum + row._count._all, 0);
    const graded = submissions.filter((row) => row.status === 'graded' && row.score !== null);
    const bestQuiz = new Map<number, { percent: number; passed: boolean }>();
    for (const row of attempts.filter((a) => a.status === 'graded')) {
      const prev = bestQuiz.get(row.quizId);
      if (!prev || row.percent > prev.percent) bestQuiz.set(row.quizId, row);
    }

    const courseProgress = await Promise.all(
      courses.map(async (course) => {
        const [total, done] = await Promise.all([
          this.prisma.courseLesson.count({ where: { module: { courseId: course.id } } }),
          this.prisma.lessonProgress.count({
            where: { studentId, lesson: { module: { courseId: course.id } } },
          }),
        ]);
        return {
          course_id: toId(course.id),
          course_name: course.name,
          completed_lessons: done,
          total_lessons: total,
          progress: percent(done, total),
        };
      }),
    );

    const assignmentAvg = avg(graded.map((row) => percent(row.score ?? 0, row.assignment.maxScore)));
    const quizAvg = avg([...bestQuiz.values()].map((row) => row.percent));
    const parts = [assignmentAvg, quizAvg].filter((v): v is number => v !== null);

    return {
      data: {
        student_id: toId(student.id),
        student_name: student.fullName,
        attendance: {
          total: attendanceTotal,
          attended,
          rate: percent(attended, attendanceTotal),
        },
        assignments: {
          total: assignments,
          submitted: submissions.length,
          graded: graded.length,
          average_percent: assignmentAvg,
        },
        quizzes: {
          attempted: bestQuiz.size,
          passed: [...bestQuiz.values()].filter((row) => row.passed).length,
          average_percent: quizAvg,
        },
        courses: courseProgress,
        overall_percent: avg(parts),
      },
    };
  }

  async courseProgress(user: RequestUser, courseId: number) {
    const enrollment = await this.curriculum.enrollments(user, courseId);
    const ids = enrollment.data.map((row) => Number(row.student_id));
    const [submissions, attempts] = await Promise.all([
      this.prisma.assignmentSubmission.findMany({
        where: {
          studentId: { in: ids },
          status: 'graded',
          assignment: { courseId, deleted_at: null },
        },
        select: { studentId: true, score: true, assignment: { select: { maxScore: true } } },
      }),
      this.prisma.quizAttempt.findMany({
        where: { studentId: { in: ids }, status: 'graded', quiz: { courseId, deleted_at: null } },
        select: { studentId: true, percent: true },
      }),
    ]);
    const by = <T extends { studentId: number }>(rows: T[], pick: (row: T) => number) => {
      const map = new Map<number, number[]>();
      for (const row of rows) map.set(row.studentId, [...(map.get(row.studentId) ?? []), pick(row)]);
      return map;
    };
    const assignmentOf = by(submissions, (row) => percent(row.score ?? 0, row.assignment.maxScore));
    const quizOf = by(attempts, (row) => row.percent);

    const students = enrollment.data.map((row) => ({
      ...row,
      assignment_average: avg(assignmentOf.get(Number(row.student_id)) ?? []),
      quiz_average: avg(quizOf.get(Number(row.student_id)) ?? []),
    }));
    return {
      data: {
        students,
        summary: {
          enrolled: students.length,
          average_progress: avg(students.map((row) => row.progress)),
          average_quiz: avg(students.map((row) => row.quiz_average).filter((v): v is number => v !== null)),
          average_assignment: avg(
            students.map((row) => row.assignment_average).filter((v): v is number => v !== null),
          ),
        },
      },
    };
  }

  /** LMS dashboard kartalari. */
  async summary(user: RequestUser, actor: V2Actor) {
    const org = this.access.orgWhere(user);
    if (!org) {
      return { data: null };
    }
    const teacherGroups = await this.access.teacherGroupIds(actor);
    const groupScope = teacherGroups ? { groupId: { in: teacherGroups } } : {};
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);

    const [
      subjects,
      courses,
      students,
      teachers,
      openAssignments,
      pendingReview,
      publishedQuizzes,
      quizAvg,
      attendance,
      recentAttempts,
      upcoming,
    ] = await Promise.all([
      this.prisma.subject.count({ where: { ...org, deleted_at: null } }),
      this.prisma.course.count({ where: { ...org, deleted_at: null } }),
      this.prisma.student.count({ where: { ...org, deleted_at: null, status: UserStatus.ACTIVE } }),
      this.prisma.teacher.count({ where: { ...org, deleted_at: null, status: UserStatus.ACTIVE } }),
      this.prisma.assignment.count({
        where: { ...org, ...groupScope, deleted_at: null, status: 'published' },
      }),
      this.prisma.assignmentSubmission.count({
        where: { status: 'submitted', assignment: { ...org, ...groupScope, deleted_at: null } },
      }),
      this.prisma.quiz.count({ where: { ...org, ...groupScope, deleted_at: null, status: 'published' } }),
      this.prisma.quizAttempt.aggregate({
        where: { status: 'graded', submittedAt: { gte: since }, quiz: { ...org, ...groupScope } },
        _avg: { percent: true },
        _count: { _all: true },
      }),
      this.prisma.attendance.groupBy({
        by: ['status'],
        where: { created_at: { gte: since }, student: { ...org } },
        _count: { _all: true },
      }),
      this.prisma.quizAttempt.findMany({
        where: { quiz: { ...org, ...groupScope } },
        include: {
          student: { select: { fullName: true } },
          quiz: { select: { title: true } },
        },
        orderBy: { submittedAt: 'desc' },
        take: 5,
      }),
      this.prisma.assignment.findMany({
        where: {
          ...org,
          ...groupScope,
          deleted_at: null,
          status: 'published',
          dueDate: { gte: new Date() },
        },
        include: { group: { select: { name: true } } },
        orderBy: { dueDate: 'asc' },
        take: 5,
      }),
    ]);
    const attTotal = attendance.reduce((s, r) => s + r._count._all, 0);
    const attended = attendance
      .filter((r) => r.status === AttendanceStatus.PRESENT || r.status === AttendanceStatus.LATE)
      .reduce((s, r) => s + r._count._all, 0);

    return {
      data: {
        subjects,
        courses,
        active_students: students,
        active_teachers: teachers,
        open_assignments: openAssignments,
        pending_review: pendingReview,
        published_quizzes: publishedQuizzes,
        quiz_attempts_30d: quizAvg._count._all,
        quiz_average_30d:
          quizAvg._avg.percent !== null ? Math.round(quizAvg._avg.percent * 10) / 10 : null,
        attendance_rate_30d: attTotal ? percent(attended, attTotal) : null,
        recent_results: recentAttempts.map((row) => ({
          id: toId(row.id),
          quiz_title: row.quiz.title,
          student_name: row.student.fullName,
          percent: row.percent,
          passed: row.passed,
          submitted_at: iso(row.submittedAt),
        })),
        upcoming_deadlines: upcoming.map((row) => ({
          id: toId(row.id),
          title: row.title,
          group_name: row.group?.name ?? null,
          due_date: iso(row.dueDate),
        })),
      },
    };
  }
}

