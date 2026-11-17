import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceStatus,
  NotificationAudience,
  PaymentStatus,
  Prisma,
  Role,
  Status,
} from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { V2BalanceService } from '../common/v2-balance.service';
import { V2FilesService } from '../common/v2-files.service';
import { iso, money, percent, toId } from '../common/v2.mapper';
import { scoreQuestion } from '../lms/quizzes.service';
import type { Learner } from './learner.guard';

type Answer = number | number[] | string;

const DAY = 24 * 60 * 60 * 1000;

const ATTENDANCE_OF: Record<AttendanceStatus, string> = {
  PRESENT: 'present',
  ABSENT: 'absent',
  LATE: 'late',
  EXCUSED: 'excused',
};

/**
 * O'quvchi kabineti: o'quvchi faqat O'ZINING ma'lumotlarini ko'radi —
 * guruhlari, kurslari, topshiriq/testlari, baholari, davomati va to'lovlari.
 */
@Injectable()
export class LearnerService {
  constructor(
    private prisma: PrismaService,
    private balances: V2BalanceService,
    private files: V2FilesService,
  ) {}

  // --- Doira ---------------------------------------------------------------

  private async groupIds(learner: Learner): Promise<number[]> {
    const rows = await this.prisma.studentGroup.findMany({
      where: {
        studentId: learner.id,
        status: Status.ACTIVE,
        group: { deleted_at: null },
      },
      select: { groupId: true },
    });
    return rows.map((row) => row.groupId);
  }

  private async courseIds(learner: Learner): Promise<number[]> {
    const [student, groups] = await Promise.all([
      this.prisma.student.findUnique({
        where: { id: learner.id },
        select: { courseId: true },
      }),
      this.prisma.studentGroup.findMany({
        where: {
          studentId: learner.id,
          status: Status.ACTIVE,
          group: { deleted_at: null, courseId: { not: null } },
        },
        select: { group: { select: { courseId: true } } },
      }),
    ]);
    const ids = groups.map((row) => row.group.courseId as number);
    if (student?.courseId) ids.push(student.courseId);
    return [...new Set(ids)];
  }

  /** Topshiriq/test o'quvchiga tegishlimi: guruhi yoki (guruhsiz) kursi orqali. */
  private async workWhere(learner: Learner) {
    const [groups, courses] = await Promise.all([
      this.groupIds(learner),
      this.courseIds(learner),
    ]);
    return {
      organizationId: learner.organizationId,
      deleted_at: null,
      OR: [
        { groupId: { in: groups } },
        { groupId: null, courseId: { in: courses } },
      ],
    };
  }

  // --- Bosh sahifa -----------------------------------------------------------

  async dashboard(learner: Learner) {
    const s = learner.settings;
    const groups = await this.groupIds(learner);
    const now = new Date();

    const lessonsQuery = this.prisma.lesson.findMany({
      where: { groupId: { in: s.schedule ? groups : [] }, date: { gte: now } },
      include: {
        group: { select: { name: true } },
        teacher: { select: { fullName: true } },
      },
      orderBy: { date: 'asc' },
      take: 5,
    });

    const [nextLessons, assignments, quizzes, attendance, balance, unread] =
      await Promise.all([
        lessonsQuery,
        s.assignments ? this.assignments(learner) : Promise.resolve(null),
        s.quizzes ? this.quizzes(learner) : Promise.resolve(null),
        s.attendance ? this.attendance(learner) : Promise.resolve(null),
        s.payments ? this.payments(learner) : Promise.resolve(null),
        s.notifications ? this.unreadCount(learner) : Promise.resolve(null),
      ]);

    return {
      data: {
        groups_count: groups.length,
        next_lessons: nextLessons.map((row) => ({
          id: toId(row.id),
          title: row.title,
          date: iso(row.date),
          lesson_type: row.lessonType,
          group_name: row.group.name,
          teacher_name: row.teacher?.fullName ?? null,
        })),
        pending_assignments: assignments
          ? assignments.data.filter((row) => row.my_status === 'pending').length
          : null,
        open_quizzes: quizzes
          ? quizzes.data.filter((row) => row.can_attempt).length
          : null,
        attendance_percent: attendance?.data.summary.percent ?? null,
        balance: balance?.data.balance ?? null,
        unread_notifications: unread,
      },
    };
  }

  // --- Guruhlar va jadval ----------------------------------------------------

  async groups(learner: Learner) {
    const ids = await this.groupIds(learner);
    const rows = await this.prisma.group.findMany({
      where: { id: { in: ids } },
      include: {
        course: { select: { name: true } },
        teacher: { select: { fullName: true, phone: true } },
        branch: { select: { name: true } },
        templates: {
          where: { isActive: true },
          orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        },
        _count: {
          select: { studentGroup: { where: { status: Status.ACTIVE } } },
        },
      },
      orderBy: { name: 'asc' },
    });
    return {
      data: rows.map((row) => ({
        id: toId(row.id),
        name: row.name,
        course_name: row.course?.name ?? null,
        teacher_name: row.teacher?.fullName ?? null,
        branch_name: row.branch?.name ?? null,
        course_type: row.courseType.toLowerCase(),
        students_count: row._count.studentGroup,
        schedule: row.templates.map((t) => ({
          day_of_week: t.dayOfWeek,
          start_time: t.startTime,
          end_time: t.endTime,
          lesson_type: t.lessonType,
        })),
      })),
    };
  }

  async schedule(learner: Learner, from?: string, to?: string) {
    const start = from
      ? new Date(`${from}T00:00:00+05:00`)
      : new Date(Date.now() - 7 * DAY);
    const end = to
      ? new Date(`${to}T23:59:59+05:00`)
      : new Date(Date.now() + 21 * DAY);
    const groups = await this.groupIds(learner);
    const rows = await this.prisma.lesson.findMany({
      where: { groupId: { in: groups }, date: { gte: start, lte: end } },
      include: {
        group: { select: { name: true } },
        teacher: { select: { fullName: true } },
        attendances: {
          where: { studentId: learner.id },
          select: { status: true },
          take: 1,
        },
      },
      orderBy: { date: 'asc' },
    });
    return {
      data: rows.map((row) => ({
        id: toId(row.id),
        title: row.title,
        date: iso(row.date),
        lesson_type: row.lessonType,
        group_id: toId(row.groupId),
        group_name: row.group.name,
        teacher_name: row.teacher?.fullName ?? null,
        attendance: row.attendances[0]
          ? ATTENDANCE_OF[row.attendances[0].status]
          : null,
      })),
    };
  }

  // --- Kurslar ----------------------------------------------------------------

  async courses(learner: Learner) {
    const ids = await this.courseIds(learner);
    const rows = await this.prisma.course.findMany({
      where: { id: { in: ids }, deleted_at: null },
      include: {
        modules: {
          include: { lessons: { select: { id: true, durationMin: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });
    const lessonIds = rows.flatMap((c) =>
      c.modules.flatMap((m) => m.lessons.map((l) => l.id)),
    );
    const done = new Set(
      (
        await this.prisma.lessonProgress.findMany({
          where: { studentId: learner.id, lessonId: { in: lessonIds } },
          select: { lessonId: true },
        })
      ).map((row) => row.lessonId),
    );
    return {
      data: rows.map((course) => {
        const lessons = course.modules.flatMap((m) => m.lessons);
        const completed = lessons.filter((l) => done.has(l.id)).length;
        return {
          id: toId(course.id),
          name: course.name,
          description: course.description,
          modules_count: course.modules.length,
          lessons_count: lessons.length,
          completed_count: completed,
          total_minutes: lessons.reduce(
            (sum, l) => sum + (l.durationMin ?? 0),
            0,
          ),
          progress: percent(completed, lessons.length),
        };
      }),
    };
  }

  async course(learner: Learner, courseId: number) {
    if (!(await this.courseIds(learner)).includes(courseId)) {
      throw new NotFoundException('Kurs topilmadi');
    }
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: {
        modules: {
          orderBy: { position: 'asc' },
          include: {
            lessons: {
              orderBy: { position: 'asc' },
              include: { materials: { orderBy: { created_at: 'asc' } } },
            },
          },
        },
      },
    });
    if (!course || course.deleted_at)
      throw new NotFoundException('Kurs topilmadi');

    const done = new Set(
      (
        await this.prisma.lessonProgress.findMany({
          where: { studentId: learner.id, lesson: { module: { courseId } } },
          select: { lessonId: true },
        })
      ).map((row) => row.lessonId),
    );
    const lessons = course.modules.flatMap((m) => m.lessons);
    return {
      data: {
        id: toId(course.id),
        name: course.name,
        description: course.description,
        progress: percent(
          lessons.filter((l) => done.has(l.id)).length,
          lessons.length,
        ),
        modules: course.modules.map((module) => ({
          id: toId(module.id),
          title: module.title,
          description: module.description,
          lessons: module.lessons.map((lesson) => ({
            id: toId(lesson.id),
            title: lesson.title,
            content: lesson.content,
            video_url: lesson.videoUrl,
            duration_min: lesson.durationMin,
            completed: done.has(lesson.id),
            materials: lesson.materials.map((m) => ({
              id: toId(m.id),
              title: m.title,
              kind: m.kind,
              url: m.url,
              has_file: !!m.fileId,
              file_name: m.fileName,
            })),
          })),
        })),
      },
    };
  }

  async completeLesson(learner: Learner, lessonId: number, completed: boolean) {
    const lesson = await this.prisma.courseLesson.findUnique({
      where: { id: lessonId },
      select: { id: true, module: { select: { courseId: true } } },
    });
    if (
      !lesson ||
      !(await this.courseIds(learner)).includes(lesson.module.courseId)
    ) {
      throw new NotFoundException('Dars topilmadi');
    }
    if (completed) {
      await this.prisma.lessonProgress.upsert({
        where: { studentId_lessonId: { studentId: learner.id, lessonId } },
        update: {},
        create: { studentId: learner.id, lessonId },
      });
    } else {
      await this.prisma.lessonProgress.deleteMany({
        where: { studentId: learner.id, lessonId },
      });
    }
    return { data: { lesson_id: toId(lessonId), completed } };
  }

  async downloadMaterial(learner: Learner, materialId: number) {
    const material = await this.prisma.lessonMaterial.findUnique({
      where: { id: materialId },
      select: {
        fileId: true,
        lesson: { select: { module: { select: { courseId: true } } } },
      },
    });
    if (
      !material?.fileId ||
      !(await this.courseIds(learner)).includes(material.lesson.module.courseId)
    ) {
      throw new NotFoundException('Material topilmadi');
    }
    return this.files.stream(material.fileId);
  }

  // --- Topshiriqlar -----------------------------------------------------------

  async assignments(learner: Learner) {
    const rows = await this.prisma.assignment.findMany({
      where: { ...(await this.workWhere(learner)), status: 'published' },
      include: {
        course: { select: { name: true } },
        group: { select: { name: true } },
        submissions: { where: { studentId: learner.id } },
      },
      orderBy: [{ dueDate: 'asc' }, { created_at: 'desc' }],
    });
    const now = Date.now();
    return {
      data: rows.map((row) => {
        const sub = row.submissions[0];
        const overdue = !sub && !!row.dueDate && row.dueDate.getTime() < now;
        return {
          id: toId(row.id),
          title: row.title,
          description: row.description,
          due_date: iso(row.dueDate),
          max_score: row.maxScore,
          course_name: row.course?.name ?? null,
          group_name: row.group?.name ?? null,
          my_status: sub
            ? sub.score !== null
              ? 'graded'
              : sub.status === 'returned'
                ? 'returned'
                : 'submitted'
            : overdue
              ? 'overdue'
              : 'pending',
          submission: sub
            ? {
                text: sub.text,
                score: sub.score,
                feedback: sub.feedback,
                submitted_at: iso(sub.submittedAt),
                graded_at: iso(sub.gradedAt),
              }
            : null,
        };
      }),
    };
  }

  async submitAssignment(learner: Learner, id: number, text: string) {
    const row = await this.prisma.assignment.findFirst({
      where: { ...(await this.workWhere(learner)), id, status: 'published' },
      include: { submissions: { where: { studentId: learner.id } } },
    });
    if (!row) throw new NotFoundException('Topshiriq topilmadi');
    const existing = row.submissions[0];
    if (existing && existing.score !== null) {
      throw new BadRequestException(
        'Topshiriq baholangan — javobni o‘zgartirib bo‘lmaydi',
      );
    }
    await this.prisma.assignmentSubmission.upsert({
      where: {
        assignmentId_studentId: { assignmentId: id, studentId: learner.id },
      },
      update: { text, status: 'submitted', submittedAt: new Date() },
      create: {
        assignmentId: id,
        studentId: learner.id,
        text,
        status: 'submitted',
      },
    });
    const list = await this.assignments(learner);
    return { data: list.data.find((item) => item.id === toId(id)) };
  }

  // --- Testlar -----------------------------------------------------------------

  async quizzes(learner: Learner) {
    const rows = await this.prisma.quiz.findMany({
      where: {
        ...(await this.workWhere(learner)),
        status: { in: ['published', 'closed'] },
      },
      include: {
        course: { select: { name: true } },
        group: { select: { name: true } },
        _count: { select: { questions: true } },
        attempts: {
          where: { studentId: learner.id },
          orderBy: { submittedAt: 'desc' },
        },
      },
      orderBy: { created_at: 'desc' },
    });
    const now = new Date();
    return {
      data: rows.map((row) => {
        const best = [...row.attempts].sort((a, b) => b.percent - a.percent)[0];
        const inWindow =
          (!row.startsAt || now >= row.startsAt) &&
          (!row.endsAt || now <= row.endsAt);
        return {
          id: toId(row.id),
          title: row.title,
          description: row.description,
          kind: row.kind,
          duration_min: row.durationMin,
          pass_percent: row.passPercent,
          max_attempts: row.maxAttempts,
          starts_at: iso(row.startsAt),
          ends_at: iso(row.endsAt),
          questions_count: row._count.questions,
          course_name: row.course?.name ?? null,
          group_name: row.group?.name ?? null,
          attempts_used: row.attempts.length,
          can_attempt:
            row.status === 'published' &&
            inWindow &&
            row._count.questions > 0 &&
            row.attempts.length < row.maxAttempts,
          best: best
            ? {
                score: best.score,
                max_score: best.maxScore,
                percent: best.percent,
                passed: best.passed,
                status: best.status,
                submitted_at: iso(best.submittedAt),
              }
            : null,
        };
      }),
    };
  }

  async quiz(learner: Learner, id: number) {
    const list = await this.quizzes(learner);
    const summary = list.data.find((row) => row.id === toId(id));
    if (!summary) throw new NotFoundException('Test topilmadi');
    const questions = await this.prisma.quizQuestion.findMany({
      where: { quizId: id },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
    return {
      data: {
        ...summary,
        // To'g'ri javoblar o'quvchiga yuborilmaydi.
        questions: summary.can_attempt
          ? questions.map((q) => ({
              id: toId(q.id),
              text: q.text,
              type: q.type,
              options: Array.isArray(q.options) ? q.options : [],
              points: q.points,
            }))
          : [],
      },
    };
  }

  async submitQuiz(
    learner: Learner,
    id: number,
    answers: Record<string, Answer>,
  ) {
    const quiz = await this.prisma.quiz.findFirst({
      where: { ...(await this.workWhere(learner)), id },
    });
    if (!quiz) throw new NotFoundException('Test topilmadi');
    if (quiz.status !== 'published') {
      throw new BadRequestException('Test e’lon qilinmagan yoki yopilgan');
    }
    const now = new Date();
    if (
      (quiz.startsAt && now < quiz.startsAt) ||
      (quiz.endsAt && now > quiz.endsAt)
    ) {
      throw new BadRequestException('Test topshirish vaqti emas');
    }
    const used = await this.prisma.quizAttempt.count({
      where: { quizId: id, studentId: learner.id },
    });
    if (used >= quiz.maxAttempts) {
      throw new BadRequestException('Urinishlar soni tugagan');
    }

    const questions = await this.prisma.quizQuestion.findMany({
      where: { quizId: id },
    });
    let score = 0;
    let needsReview = false;
    const maxScore = questions.reduce((sum, q) => sum + q.points, 0);
    const detail: Record<
      string,
      { answer: Answer | null; points: number | null }
    > = {};
    for (const question of questions) {
      const answer = answers[String(question.id)];
      const points = scoreQuestion(question, answer);
      if (points === null) needsReview = true;
      score += points ?? 0;
      detail[String(question.id)] = { answer: answer ?? null, points };
    }
    const pct = percent(score, maxScore);
    const row = await this.prisma.quizAttempt.create({
      data: {
        quizId: id,
        studentId: learner.id,
        answers: detail as Prisma.InputJsonValue,
        score,
        maxScore,
        percent: pct,
        passed: pct >= quiz.passPercent,
        status: needsReview ? 'needs_review' : 'graded',
        submittedAt: now,
      },
    });
    return {
      data: {
        id: toId(row.id),
        score: row.score,
        max_score: row.maxScore,
        percent: row.percent,
        passed: row.passed,
        status: row.status,
        attempt_no: used + 1,
      },
    };
  }

  // --- Baholar ----------------------------------------------------------------

  async grades(learner: Learner) {
    const [subs, attempts] = await Promise.all([
      this.prisma.assignmentSubmission.findMany({
        where: {
          studentId: learner.id,
          score: { not: null },
          assignment: { deleted_at: null },
        },
        include: {
          assignment: {
            select: {
              title: true,
              maxScore: true,
              course: { select: { name: true } },
              group: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.quizAttempt.findMany({
        where: { studentId: learner.id, quiz: { deleted_at: null } },
        include: {
          quiz: {
            select: {
              title: true,
              kind: true,
              course: { select: { name: true } },
              group: { select: { name: true } },
            },
          },
        },
      }),
    ]);
    const rows = [
      ...subs.map((s) => ({
        id: `a${s.id}`,
        kind: 'assignment',
        title: s.assignment.title,
        context: s.assignment.group?.name ?? s.assignment.course?.name ?? null,
        score: s.score as number,
        max_score: s.assignment.maxScore,
        percent: percent(s.score as number, s.assignment.maxScore),
        feedback: s.feedback,
        date: iso(s.gradedAt ?? s.submittedAt),
      })),
      ...attempts.map((a) => ({
        id: `q${a.id}`,
        kind: a.quiz.kind === 'exam' ? 'exam' : 'quiz',
        title: a.quiz.title,
        context: a.quiz.group?.name ?? a.quiz.course?.name ?? null,
        score: a.score,
        max_score: a.maxScore,
        percent: a.percent,
        feedback: a.feedback,
        date: iso(a.submittedAt),
      })),
    ].sort((x, y) => String(y.date).localeCompare(String(x.date)));
    const average = rows.length
      ? Math.round(
          (rows.reduce((sum, r) => sum + r.percent, 0) / rows.length) * 10,
        ) / 10
      : null;
    return { data: { average_percent: average, items: rows } };
  }

  // --- Davomat ----------------------------------------------------------------

  async attendance(learner: Learner) {
    const rows = await this.prisma.attendance.findMany({
      where: { studentId: learner.id },
      include: {
        lesson: {
          select: {
            title: true,
            date: true,
            created_at: true,
            group: { select: { name: true } },
          },
        },
      },
      orderBy: { lesson: { date: 'desc' } },
      take: 200,
    });
    const count = (status: AttendanceStatus) =>
      rows.filter((r) => r.status === status).length;
    const present = count(AttendanceStatus.PRESENT);
    const late = count(AttendanceStatus.LATE);
    return {
      data: {
        summary: {
          total: rows.length,
          present,
          late,
          absent: count(AttendanceStatus.ABSENT),
          excused: count(AttendanceStatus.EXCUSED),
          percent: percent(present + late, rows.length),
        },
        items: rows.map((r) => ({
          id: toId(r.id),
          date: iso(r.lesson.date ?? r.lesson.created_at),
          lesson_title: r.lesson.title,
          group_name: r.lesson.group.name,
          status: ATTENDANCE_OF[r.status],
          comment: r.comment,
        })),
      },
    };
  }

  // --- To'lovlar ----------------------------------------------------------------

  async payments(learner: Learner) {
    const [balanceMap, rows] = await Promise.all([
      this.balances.forStudents([learner.id]),
      this.prisma.payment.findMany({
        where: { studentId: learner.id, status: PaymentStatus.PAID },
        include: {
          group: { select: { name: true } },
          course: { select: { name: true } },
        },
        orderBy: { paidAt: 'desc' },
        take: 100,
      }),
    ]);
    const balance = balanceMap.get(learner.id);
    return {
      data: {
        balance: {
          total_price: money(balance?.totalPrice),
          paid: money(balance?.paid),
          debt: money(balance?.debt),
        },
        items: rows.map((row) => ({
          id: toId(row.id),
          amount: money(row.amount),
          method: row.method?.toLowerCase() ?? null,
          paid_at: iso(row.paidAt ?? row.created_at),
          context: row.group?.name ?? row.course?.name ?? null,
        })),
      },
    };
  }

  // --- Bildirishnomalar -----------------------------------------------------------

  private async notificationWhere(
    learner: Learner,
  ): Promise<Prisma.NotificationWhereInput> {
    const groups = await this.groupIds(learner);
    return {
      organizationId: learner.organizationId,
      OR: [
        { audience: NotificationAudience.ALL },
        { audience: NotificationAudience.ORGANIZATION },
        { audience: NotificationAudience.STUDENTS },
        { audience: NotificationAudience.GROUP, groupId: { in: groups } },
        {
          audience: NotificationAudience.USER,
          recipientRole: Role.STUDENT,
          recipientId: learner.id,
        },
      ],
    };
  }

  async notifications(learner: Learner) {
    const rows = await this.prisma.notification.findMany({
      where: await this.notificationWhere(learner),
      include: {
        reads: {
          where: { recipientRole: Role.STUDENT, recipientId: learner.id },
          select: { id: true },
        },
        group: { select: { name: true } },
      },
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    return {
      data: rows.map((row) => ({
        id: toId(row.id),
        title: row.title,
        message: row.message,
        type: row.type.toLowerCase(),
        group_name: row.group?.name ?? null,
        created_by_name: row.createdByName,
        created_at: iso(row.created_at),
        is_read: row.reads.length > 0,
      })),
      unread_count: rows.filter((row) => row.reads.length === 0).length,
    };
  }

  async unreadCount(learner: Learner): Promise<number> {
    return this.prisma.notification.count({
      where: {
        AND: [
          await this.notificationWhere(learner),
          {
            reads: {
              none: { recipientRole: Role.STUDENT, recipientId: learner.id },
            },
          },
        ],
      },
    });
  }

  async markRead(learner: Learner, id?: number) {
    const rows = await this.prisma.notification.findMany({
      where: {
        AND: [
          await this.notificationWhere(learner),
          id ? { id } : {},
          {
            reads: {
              none: { recipientRole: Role.STUDENT, recipientId: learner.id },
            },
          },
        ],
      },
      select: { id: true },
    });
    if (rows.length) {
      await this.prisma.notificationRead.createMany({
        data: rows.map((row) => ({
          notificationId: row.id,
          recipientRole: Role.STUDENT,
          recipientId: learner.id,
        })),
        skipDuplicates: true,
      });
    }
    return { data: { unread_count: await this.unreadCount(learner) } };
  }
}
