import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { Status } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import type { V2Actor } from '../common/v2-auth.guard';
import { V2AuditService } from '../common/v2-audit.service';
import { V2FilesService, type UploadedBlob } from '../common/v2-files.service';
import { DOCUMENT_MIME_TYPES } from '../documents/v2-documents.service';
import { percent, toId } from '../common/v2.mapper';
import { LmsAccessService } from './lms-access.service';
import type {
  CreateCourseLessonDto,
  CreateMaterialDto,
  CreateModuleDto,
  EnrollStudentDto,
  ProgressMarkDto,
  UpdateCourseLessonDto,
  UpdateModuleDto,
} from './lms.dto';

/** Dars materiali sifatida qabul qilinadigan fayllar. */
export const MATERIAL_MIME_TYPES = [
  ...DOCUMENT_MIME_TYPES,
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'video/mp4',
  'audio/mpeg',
];

@Injectable()
export class LmsCurriculumService {
  constructor(
    private prisma: PrismaService,
    private access: LmsAccessService,
    private files: V2FilesService,
    private audit: V2AuditService,
  ) {}

  // --- Kurs o'quv dasturi -------------------------------------------------------

  async curriculum(user: RequestUser, courseId: number) {
    const course = await this.course(user, courseId);
    const modules = await this.prisma.courseModule.findMany({
      where: { courseId },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      include: {
        lessons: {
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          include: {
            materials: { orderBy: { id: 'asc' } },
            _count: { select: { progress: true } },
          },
        },
      },
    });
    const enrolled = (await this.enrolledIds(courseId)).length;
    const lessons = modules.flatMap((module) => module.lessons);

    return {
      data: {
        course_id: toId(course.id),
        course_name: course.name,
        enrolled_count: enrolled,
        modules_count: modules.length,
        lessons_count: lessons.length,
        total_minutes: lessons.reduce((sum, row) => sum + (row.durationMin ?? 0), 0),
        modules: modules.map((module) => ({
          ...toModule(module),
          lessons: module.lessons.map((lesson) => ({
            ...toLesson(lesson),
            materials: lesson.materials.map(toMaterial),
            completed_count: lesson._count.progress,
            completion_rate: percent(lesson._count.progress, enrolled),
          })),
        })),
      },
    };
  }

  async createModule(
    user: RequestUser,
    actor: V2Actor,
    courseId: number,
    payload: CreateModuleDto,
  ) {
    const course = await this.course(user, courseId);
    await this.assertCourseEdit(actor, courseId);
    const position =
      payload.position ??
      (await this.prisma.courseModule.count({ where: { courseId } }));
    const row = await this.prisma.courseModule.create({
      data: {
        courseId,
        title: payload.title,
        description: payload.description || null,
        position,
      },
    });
    await this.audit.record(actor, 'CREATE', 'course_module', row.id, {
      organizationId: course.organizationId,
      changes: { title: row.title, course: course.name },
    });
    return { data: toModule(row) };
  }

  async updateModule(
    user: RequestUser,
    actor: V2Actor,
    id: number,
    payload: UpdateModuleDto,
  ) {
    const module = await this.module(user, id);
    await this.assertCourseEdit(actor, module.courseId);
    const row = await this.prisma.courseModule.update({
      where: { id },
      data: {
        ...(payload.title !== undefined ? { title: payload.title } : {}),
        ...(payload.description !== undefined
          ? { description: payload.description || null }
          : {}),
        ...(payload.position !== undefined ? { position: payload.position } : {}),
      },
    });
    return { data: toModule(row) };
  }

  async removeModule(user: RequestUser, actor: V2Actor, id: number) {
    const module = await this.module(user, id);
    await this.assertCourseEdit(actor, module.courseId);
    await this.prisma.courseModule.delete({ where: { id } });
    await this.audit.record(actor, 'DELETE', 'course_module', id, {
      organizationId: module.course.organizationId,
      changes: { title: module.title },
    });
  }

  async createLesson(
    user: RequestUser,
    actor: V2Actor,
    moduleId: number,
    payload: CreateCourseLessonDto,
  ) {
    const module = await this.module(user, moduleId);
    await this.assertCourseEdit(actor, module.courseId);
    const position =
      payload.position ??
      (await this.prisma.courseLesson.count({ where: { moduleId } }));
    const row = await this.prisma.courseLesson.create({
      data: {
        moduleId,
        title: payload.title,
        content: payload.content || null,
        videoUrl: payload.video_url ?? null,
        durationMin: payload.duration_min ?? null,
        position,
      },
    });
    await this.audit.record(actor, 'CREATE', 'course_lesson', row.id, {
      organizationId: module.course.organizationId,
      changes: { title: row.title, module: module.title },
    });
    return { data: { ...toLesson(row), materials: [] } };
  }

  async lessonDetail(user: RequestUser, id: number) {
    const lesson = await this.lesson(user, id);
    const materials = await this.prisma.lessonMaterial.findMany({
      where: { lessonId: id },
      orderBy: { id: 'asc' },
    });
    return {
      data: {
        ...toLesson(lesson),
        module_title: lesson.module.title,
        course_id: toId(lesson.module.courseId),
        materials: materials.map(toMaterial),
      },
    };
  }

  async updateLesson(
    user: RequestUser,
    actor: V2Actor,
    id: number,
    payload: UpdateCourseLessonDto,
  ) {
    const lesson = await this.lesson(user, id);
    await this.assertCourseEdit(actor, lesson.module.courseId);
    const row = await this.prisma.courseLesson.update({
      where: { id },
      data: {
        ...(payload.title !== undefined ? { title: payload.title } : {}),
        ...(payload.content !== undefined ? { content: payload.content || null } : {}),
        ...(payload.video_url !== undefined
          ? { videoUrl: payload.video_url || null }
          : {}),
        ...(payload.duration_min !== undefined
          ? { durationMin: payload.duration_min }
          : {}),
        ...(payload.position !== undefined ? { position: payload.position } : {}),
      },
    });
    return { data: toLesson(row) };
  }

  async removeLesson(user: RequestUser, actor: V2Actor, id: number) {
    const lesson = await this.lesson(user, id);
    await this.assertCourseEdit(actor, lesson.module.courseId);
    await this.prisma.courseLesson.delete({ where: { id } });
    await this.audit.record(actor, 'DELETE', 'course_lesson', id, {
      organizationId: lesson.module.course.organizationId,
      changes: { title: lesson.title },
    });
  }

  // --- Materiallar ---------------------------------------------------------------

  async addMaterial(
    user: RequestUser,
    actor: V2Actor,
    lessonId: number,
    payload: CreateMaterialDto,
    file: UploadedBlob | undefined,
  ) {
    const lesson = await this.lesson(user, lessonId);
    await this.assertCourseEdit(actor, lesson.module.courseId);

    let stored: { id: number; mimeType: string; size: number } | null = null;
    let fileName: string | null = null;
    if (file) {
      stored = await this.files.save(
        file,
        lesson.module.course.organizationId,
        MATERIAL_MIME_TYPES,
      );
      fileName = decodeName(file);
    } else if (!payload.url) {
      throw new BadRequestException('Fayl yoki havola kiritilishi shart');
    }

    const row = await this.prisma.lessonMaterial.create({
      data: {
        lessonId,
        kind: payload.kind,
        title: payload.title?.trim() || fileName || payload.url || 'Material',
        url: stored ? null : (payload.url ?? null),
        fileId: stored?.id ?? null,
        fileName,
        mimeType: stored?.mimeType ?? null,
        size: stored?.size ?? null,
      },
    });
    await this.audit.record(actor, 'CREATE', 'lesson_material', row.id, {
      organizationId: lesson.module.course.organizationId,
      changes: { title: row.title, lesson: lesson.title },
    });
    return { data: toMaterial(row) };
  }

  async removeMaterial(user: RequestUser, actor: V2Actor, id: number) {
    const material = await this.material(user, id);
    await this.assertCourseEdit(actor, material.lesson.module.courseId);
    await this.prisma.lessonMaterial.delete({ where: { id } });
  }

  async downloadMaterial(user: RequestUser, id: number) {
    const material = await this.material(user, id);
    if (!material.fileId) throw new NotFoundException('Bu material fayl emas');
    const file = await this.files.stream(material.fileId);
    return new StreamableFile(file.getStream(), {
      type: material.mimeType ?? 'application/octet-stream',
      length: material.size ?? undefined,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(
        material.fileName ?? 'material',
      )}`,
    });
  }

  // --- Progress -------------------------------------------------------------------

  async markProgress(user: RequestUser, lessonId: number, payload: ProgressMarkDto) {
    const lesson = await this.lesson(user, lessonId);
    const student = await this.access.student(
      lesson.module.course.organizationId,
      payload.student_id,
    );
    const enrolled = await this.enrolledIds(lesson.module.courseId);
    if (!enrolled.includes(student.id)) {
      throw new BadRequestException('O‘quvchi bu kursga yozilmagan');
    }
    if (payload.completed) {
      await this.prisma.lessonProgress.upsert({
        where: { studentId_lessonId: { studentId: student.id, lessonId } },
        update: {},
        create: { studentId: student.id, lessonId },
      });
    } else {
      await this.prisma.lessonProgress.deleteMany({
        where: { studentId: student.id, lessonId },
      });
    }
    return { data: { lesson_id: toId(lessonId), student_id: toId(student.id), completed: payload.completed } };
  }

  // --- Kursga yozilish (enrollment) -------------------------------------------------

  async enrollments(user: RequestUser, courseId: number) {
    await this.course(user, courseId);
    const ids = await this.enrolledIds(courseId);
    const [students, memberships, lessonsTotal, progress] = await Promise.all([
      this.prisma.student.findMany({
        where: { id: { in: ids }, deleted_at: null },
        select: { id: true, fullName: true, phone: true, status: true, startDate: true },
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.studentGroup.findMany({
        where: {
          studentId: { in: ids },
          status: Status.ACTIVE,
          group: { courseId, deleted_at: null },
        },
        select: { studentId: true, group: { select: { id: true, name: true } } },
      }),
      this.prisma.courseLesson.count({ where: { module: { courseId } } }),
      this.prisma.lessonProgress.groupBy({
        by: ['studentId'],
        where: { studentId: { in: ids }, lesson: { module: { courseId } } },
        _count: { _all: true },
      }),
    ]);
    const groupOf = new Map(memberships.map((row) => [row.studentId, row.group]));
    const doneOf = new Map(progress.map((row) => [row.studentId, row._count._all]));

    return {
      data: students.map((row) => ({
        student_id: toId(row.id),
        student_name: row.fullName,
        phone: row.phone,
        status: row.status.toLowerCase(),
        group_id: groupOf.get(row.id) ? toId(groupOf.get(row.id)!.id) : null,
        group_name: groupOf.get(row.id)?.name ?? null,
        completed_lessons: doneOf.get(row.id) ?? 0,
        total_lessons: lessonsTotal,
        progress: percent(doneOf.get(row.id) ?? 0, lessonsTotal),
      })),
    };
  }

  async enroll(
    user: RequestUser,
    actor: V2Actor,
    courseId: number,
    payload: EnrollStudentDto,
  ) {
    const course = await this.course(user, courseId);
    if (actor.role === 'teacher') {
      throw new ForbiddenException('O‘quvchini kursga faqat administrator yozadi');
    }
    const student = await this.access.student(course.organizationId, payload.student_id);
    const group = await this.access.group(course.organizationId, payload.group_id);
    if (group && group.courseId !== courseId) {
      throw new BadRequestException('Guruh bu kursga tegishli emas');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.student.update({ where: { id: student.id }, data: { courseId } });
      if (group) {
        await tx.studentGroup.upsert({
          where: { groupId_studentId: { groupId: group.id, studentId: student.id } },
          update: { status: Status.ACTIVE },
          create: { groupId: group.id, studentId: student.id },
        });
      }
    });
    await this.audit.record(actor, 'CREATE', 'enrollment', student.id, {
      organizationId: course.organizationId,
      changes: { course: course.name, student: student.fullName, group: group?.name ?? null },
    });
    return this.enrollments(user, courseId);
  }

  async unenroll(user: RequestUser, actor: V2Actor, courseId: number, studentId: number) {
    const course = await this.course(user, courseId);
    if (actor.role === 'teacher') {
      throw new ForbiddenException('O‘quvchini kursdan faqat administrator chiqaradi');
    }
    const ids = await this.enrolledIds(courseId);
    if (!ids.includes(studentId)) throw new NotFoundException('O‘quvchi bu kursda emas');

    await this.prisma.$transaction([
      this.prisma.student.updateMany({
        where: { id: studentId, courseId },
        data: { courseId: null },
      }),
      this.prisma.studentGroup.updateMany({
        where: { studentId, group: { courseId } },
        data: { status: Status.INACTIVE },
      }),
    ]);
    await this.audit.record(actor, 'DELETE', 'enrollment', studentId, {
      organizationId: course.organizationId,
      changes: { course: course.name },
    });
  }

  /** Kursga yozilgan o'quvchilar: kursi shu bo'lganlar + kurs guruhlari a'zolari. */
  async enrolledIds(courseId: number): Promise<number[]> {
    const [direct, viaGroup] = await Promise.all([
      this.prisma.student.findMany({
        where: { courseId, deleted_at: null },
        select: { id: true },
      }),
      this.prisma.studentGroup.findMany({
        where: {
          status: Status.ACTIVE,
          group: { courseId, deleted_at: null },
          student: { deleted_at: null },
        },
        select: { studentId: true },
      }),
    ]);
    return [...new Set([...direct.map((r) => r.id), ...viaGroup.map((r) => r.studentId)])];
  }

  // --- Yordamchilar ----------------------------------------------------------------

  async course(user: RequestUser, id: number) {
    const org = this.access.orgWhere(user);
    const row = org
      ? await this.prisma.course.findFirst({
          where: { id, ...org, deleted_at: null },
          select: { id: true, name: true, organizationId: true },
        })
      : null;
    if (!row || !row.organizationId) throw new NotFoundException('Kurs topilmadi');
    return { ...row, organizationId: row.organizationId };
  }

  private async module(user: RequestUser, id: number) {
    const org = this.access.orgWhere(user);
    const row = org
      ? await this.prisma.courseModule.findFirst({
          where: { id, course: { ...org, deleted_at: null } },
          include: { course: { select: { organizationId: true, name: true } } },
        })
      : null;
    if (!row) throw new NotFoundException('Modul topilmadi');
    return row;
  }

  private async lesson(user: RequestUser, id: number) {
    const org = this.access.orgWhere(user);
    const row = org
      ? await this.prisma.courseLesson.findFirst({
          where: { id, module: { course: { ...org, deleted_at: null } } },
          include: {
            module: {
              select: {
                title: true,
                courseId: true,
                course: { select: { organizationId: true } },
              },
            },
          },
        })
      : null;
    if (!row) throw new NotFoundException('Dars topilmadi');
    return row;
  }

  private async material(user: RequestUser, id: number) {
    const org = this.access.orgWhere(user);
    const row = org
      ? await this.prisma.lessonMaterial.findFirst({
          where: { id, lesson: { module: { course: { ...org, deleted_at: null } } } },
          include: { lesson: { select: { module: { select: { courseId: true } } } } },
        })
      : null;
    if (!row) throw new NotFoundException('Material topilmadi');
    return row;
  }

  /** O'qituvchi faqat o'zi dars beradigan kurs dasturini tahrirlaydi. */
  private async assertCourseEdit(actor: V2Actor, courseId: number) {
    if (!this.access.isTeacher(actor)) return;
    const teaches = await this.prisma.group.count({
      where: { courseId, teacherId: actor.ref.id, deleted_at: null },
    });
    if (!teaches) {
      throw new ForbiddenException('Bu kurs dasturini tahrirlashga ruxsat yo‘q');
    }
  }
}

function decodeName(file: UploadedBlob): string {
  const raw = (file as { originalname?: string }).originalname ?? 'material';
  const decoded = Buffer.from(raw, 'latin1').toString('utf8');
  return (decoded.includes('�') ? raw : decoded).replace(/[\\/]/g, '_').slice(0, 200);
}

function toModule(row: {
  id: number;
  courseId: number;
  title: string;
  description: string | null;
  position: number;
}) {
  return {
    id: toId(row.id),
    course_id: toId(row.courseId),
    title: row.title,
    description: row.description,
    position: row.position,
  };
}

function toLesson(row: {
  id: number;
  moduleId: number;
  title: string;
  content: string | null;
  videoUrl: string | null;
  durationMin: number | null;
  position: number;
}) {
  return {
    id: toId(row.id),
    module_id: toId(row.moduleId),
    title: row.title,
    content: row.content,
    video_url: row.videoUrl,
    duration_min: row.durationMin,
    position: row.position,
  };
}

function toMaterial(row: {
  id: number;
  lessonId: number;
  title: string;
  kind: string;
  url: string | null;
  fileId: number | null;
  fileName: string | null;
  mimeType: string | null;
  size: number | null;
  created_at: Date;
}) {
  return {
    id: toId(row.id),
    lesson_id: toId(row.lessonId),
    title: row.title,
    kind: row.kind,
    url: row.url,
    has_file: !!row.fileId,
    file_name: row.fileName,
    mime_type: row.mimeType,
    size: row.size,
    created_at: row.created_at.toISOString(),
  };
}
