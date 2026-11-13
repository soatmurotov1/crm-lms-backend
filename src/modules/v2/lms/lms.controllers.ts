import {
  Body,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiConsumes, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from 'src/common/prisma/prisma.service';
import {
  CurrentUser,
  type RequestUser,
} from 'src/common/guard/current-user.decorator';
import {
  ActiveBranch,
  CurrentActor,
  V2AuthGuard,
  V2Permission,
  V2Roles,
  type V2Actor,
} from '../common/v2-auth.guard';
import { V2Controller } from '../common/v2-controller.decorator';
import {
  MAX_UPLOAD_BYTES,
  V2FilesService,
  type UploadedBlob,
} from '../common/v2-files.service';
import { parseId, toId } from '../common/v2.mapper';
import { LMS_ADMINS, LMS_READERS, LMS_WRITERS } from './lms-access.service';
import { LmsAssignmentsService } from './assignments.service';
import { LmsCurriculumService, MATERIAL_MIME_TYPES } from './curriculum.service';
import { LmsInsightsService } from './insights.service';
import { LmsNotificationsService } from './notifications.service';
import { LmsQuizzesService } from './quizzes.service';
import { LmsSubjectsService } from './subjects.service';
import {
  AssignmentsQueryDto,
  CreateAssignmentDto,
  CreateCourseLessonDto,
  CreateMaterialDto,
  CreateModuleDto,
  CreateNotificationDto,
  CreateQuizDto,
  CreateSubjectDto,
  CreateSubmissionDto,
  EnrollStudentDto,
  GradeSubmissionDto,
  GradesQueryDto,
  NotificationsQueryDto,
  ProgressMarkDto,
  QuestionDto,
  QuizzesQueryDto,
  ReviewAttemptDto,
  SubjectsQueryDto,
  SubmitAttemptDto,
  UpdateAssignmentDto,
  UpdateCourseLessonDto,
  UpdateModuleDto,
  UpdateQuizDto,
  UpdateSubjectDto,
} from './lms.dto';

const upload = (field = 'file') =>
  UseInterceptors(
    FileInterceptor(field, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }),
  );

// --- Fanlar va kategoriyalar ------------------------------------------------------

@V2Controller('subjects')
@ApiBearerAuth()
@UseGuards(V2AuthGuard)
@V2Roles(...LMS_READERS)
export class LmsSubjectsController {
  constructor(private readonly subjects: LmsSubjectsService) {}

  @Get()
  @V2Permission('subjects.read')
  @ApiOperation({ summary: 'Fanlar / kategoriyalar ro‘yxati' })
  list(@CurrentUser() user: RequestUser, @Query() query: SubjectsQueryDto) {
    return this.subjects.list(user, query);
  }

  @Get(':id')
  @V2Permission('subjects.read')
  detail(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.subjects.detail(user, parseId(id, 'Fan'));
  }

  @Post()
  @V2Roles(...LMS_ADMINS)
  @V2Permission('subjects.create')
  @ApiOperation({ summary: 'Fan yaratish' })
  create(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Body() payload: CreateSubjectDto,
    @ActiveBranch() branchId: number | null,
  ) {
    return this.subjects.create(user, actor, payload, branchId);
  }

  @Patch(':id')
  @V2Roles(...LMS_ADMINS)
  @V2Permission('subjects.update')
  update(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: UpdateSubjectDto,
  ) {
    return this.subjects.update(user, actor, parseId(id, 'Fan'), payload);
  }

  @Delete(':id')
  @HttpCode(204)
  @V2Roles(...LMS_ADMINS)
  @V2Permission('subjects.delete')
  remove(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.subjects.remove(user, actor, parseId(id, 'Fan'));
  }
}

// --- O'quv dasturi: modullar, darslar, materiallar, yozilish -------------------------

@V2Controller('courses')
@ApiBearerAuth()
@UseGuards(V2AuthGuard)
@V2Roles(...LMS_READERS)
export class LmsCourseCurriculumController {
  constructor(
    private readonly curriculum: LmsCurriculumService,
    private readonly insights: LmsInsightsService,
  ) {}

  @Get(':id/curriculum')
  @V2Permission('curriculum.read')
  @ApiOperation({ summary: 'Kurs o‘quv dasturi (modullar → darslar → materiallar)' })
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.curriculum.curriculum(user, parseId(id, 'Kurs'));
  }

  @Post(':id/modules')
  @V2Roles(...LMS_WRITERS)
  @V2Permission('curriculum.create')
  @ApiOperation({ summary: 'Modul qo‘shish' })
  createModule(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: CreateModuleDto,
  ) {
    return this.curriculum.createModule(user, actor, parseId(id, 'Kurs'), payload);
  }

  @Get(':id/enrollments')
  @V2Permission('students.read')
  @ApiOperation({ summary: 'Kursga yozilgan o‘quvchilar va ularning progressi' })
  enrollments(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.curriculum.enrollments(user, parseId(id, 'Kurs'));
  }

  @Post(':id/enrollments')
  @V2Roles('dev', 'owner', 'manager', 'operator')
  @V2Permission('students.update')
  @ApiOperation({ summary: 'O‘quvchini kursga (va guruhga) yozish' })
  enroll(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: EnrollStudentDto,
  ) {
    return this.curriculum.enroll(user, actor, parseId(id, 'Kurs'), payload);
  }

  @Delete(':id/enrollments/:studentId')
  @HttpCode(204)
  @V2Roles('dev', 'owner', 'manager', 'operator')
  @V2Permission('students.update')
  unenroll(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Param('studentId') studentId: string,
  ) {
    return this.curriculum.unenroll(
      user,
      actor,
      parseId(id, 'Kurs'),
      parseId(studentId, 'O‘quvchi'),
    );
  }

  @Get(':id/progress')
  @V2Permission('grades.read')
  @ApiOperation({ summary: 'Kurs bo‘yicha o‘quvchilar progressi' })
  progress(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.insights.courseProgress(user, parseId(id, 'Kurs'));
  }
}

@V2Controller('modules')
@ApiBearerAuth()
@UseGuards(V2AuthGuard)
@V2Roles(...LMS_WRITERS)
export class LmsModulesController {
  constructor(private readonly curriculum: LmsCurriculumService) {}

  @Patch(':id')
  @V2Permission('curriculum.update')
  update(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: UpdateModuleDto,
  ) {
    return this.curriculum.updateModule(user, actor, parseId(id, 'Modul'), payload);
  }

  @Delete(':id')
  @HttpCode(204)
  @V2Permission('curriculum.delete')
  remove(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.curriculum.removeModule(user, actor, parseId(id, 'Modul'));
  }

  @Post(':id/lessons')
  @V2Permission('curriculum.create')
  @ApiOperation({ summary: 'Modulga dars qo‘shish' })
  createLesson(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: CreateCourseLessonDto,
  ) {
    return this.curriculum.createLesson(user, actor, parseId(id, 'Modul'), payload);
  }
}

@V2Controller('course-lessons')
@ApiBearerAuth()
@UseGuards(V2AuthGuard)
@V2Roles(...LMS_READERS)
export class LmsCourseLessonsController {
  constructor(private readonly curriculum: LmsCurriculumService) {}

  @Get(':id')
  @V2Permission('curriculum.read')
  detail(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.curriculum.lessonDetail(user, parseId(id, 'Dars'));
  }

  @Patch(':id')
  @V2Roles(...LMS_WRITERS)
  @V2Permission('curriculum.update')
  update(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: UpdateCourseLessonDto,
  ) {
    return this.curriculum.updateLesson(user, actor, parseId(id, 'Dars'), payload);
  }

  @Delete(':id')
  @HttpCode(204)
  @V2Roles(...LMS_WRITERS)
  @V2Permission('curriculum.delete')
  remove(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.curriculum.removeLesson(user, actor, parseId(id, 'Dars'));
  }

  @Post(':id/materials')
  @V2Roles(...LMS_WRITERS)
  @V2Permission('curriculum.create')
  @ApiConsumes('multipart/form-data', 'application/json')
  @upload()
  @ApiOperation({ summary: 'Darsga material (fayl, video yoki havola) qo‘shish' })
  addMaterial(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: CreateMaterialDto,
    @UploadedFile() file: UploadedBlob | undefined,
  ) {
    return this.curriculum.addMaterial(user, actor, parseId(id, 'Dars'), payload, file);
  }

  @Post(':id/progress')
  @V2Roles(...LMS_READERS)
  @V2Permission('grades.update')
  @ApiOperation({ summary: 'O‘quvchi darsni tugatganini belgilash' })
  progress(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() payload: ProgressMarkDto,
  ) {
    return this.curriculum.markProgress(user, parseId(id, 'Dars'), payload);
  }
}

@V2Controller('materials')
@ApiBearerAuth()
@UseGuards(V2AuthGuard)
@V2Roles(...LMS_READERS)
export class LmsMaterialsController {
  constructor(private readonly curriculum: LmsCurriculumService) {}

  @Get(':id/download')
  @V2Permission('curriculum.read')
  download(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.curriculum.downloadMaterial(user, parseId(id, 'Material'));
  }

  @Delete(':id')
  @HttpCode(204)
  @V2Roles(...LMS_WRITERS)
  @V2Permission('curriculum.delete')
  remove(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.curriculum.removeMaterial(user, actor, parseId(id, 'Material'));
  }
}

// --- Topshiriqlar ------------------------------------------------------------------

@V2Controller('assignments')
@ApiBearerAuth()
@UseGuards(V2AuthGuard)
@V2Roles(...LMS_READERS)
export class LmsAssignmentsController {
  constructor(private readonly assignments: LmsAssignmentsService) {}

  @Get()
  @V2Permission('assignments.read')
  @ApiOperation({ summary: 'Topshiriqlar ro‘yxati' })
  list(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Query() query: AssignmentsQueryDto,
  ) {
    return this.assignments.list(user, actor, query);
  }

  @Get(':id')
  @V2Permission('assignments.read')
  detail(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.assignments.detail(user, actor, parseId(id, 'Topshiriq'));
  }

  @Post()
  @V2Roles(...LMS_WRITERS)
  @V2Permission('assignments.create')
  create(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Body() payload: CreateAssignmentDto,
    @ActiveBranch() branchId: number | null,
  ) {
    return this.assignments.create(user, actor, payload, branchId);
  }

  @Patch(':id')
  @V2Roles(...LMS_WRITERS)
  @V2Permission('assignments.update')
  update(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: UpdateAssignmentDto,
  ) {
    return this.assignments.update(user, actor, parseId(id, 'Topshiriq'), payload);
  }

  @Delete(':id')
  @HttpCode(204)
  @V2Roles(...LMS_WRITERS)
  @V2Permission('assignments.delete')
  remove(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.assignments.remove(user, actor, parseId(id, 'Topshiriq'));
  }

  @Get(':id/submissions')
  @V2Permission('assignments.read')
  @ApiOperation({ summary: 'Topshiriq javoblari (topshirmaganlar bilan)' })
  submissions(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.assignments.submissions(user, actor, parseId(id, 'Topshiriq'));
  }

  @Post(':id/submissions')
  @V2Permission('assignments.update')
  @ApiConsumes('multipart/form-data', 'application/json')
  @upload()
  @ApiOperation({ summary: 'O‘quvchi javobini qayd etish' })
  submit(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: CreateSubmissionDto,
    @UploadedFile() file: UploadedBlob | undefined,
  ) {
    return this.assignments.submit(user, actor, parseId(id, 'Topshiriq'), payload, file);
  }
}

@V2Controller('submissions')
@ApiBearerAuth()
@UseGuards(V2AuthGuard)
@V2Roles(...LMS_WRITERS)
export class LmsSubmissionsController {
  constructor(private readonly assignments: LmsAssignmentsService) {}

  @Patch(':id/grade')
  @V2Permission('grades.update')
  @ApiOperation({ summary: 'Javobni baholash' })
  grade(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: GradeSubmissionDto,
  ) {
    return this.assignments.grade(user, actor, parseId(id, 'Javob'), payload);
  }

  @Get(':id/download')
  @V2Roles(...LMS_READERS)
  @V2Permission('assignments.read')
  download(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.assignments.downloadSubmission(user, actor, parseId(id, 'Javob'));
  }
}

// --- Testlar va imtihonlar -----------------------------------------------------------

@V2Controller('exams')
@ApiBearerAuth()
@UseGuards(V2AuthGuard)
@V2Roles(...LMS_READERS)
export class LmsExamsController {
  constructor(private readonly quizzes: LmsQuizzesService) {}

  @Get()
  @V2Permission('exams.read')
  @ApiOperation({ summary: 'Testlar va imtihonlar' })
  list(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Query() query: QuizzesQueryDto,
  ) {
    return this.quizzes.list(user, actor, query);
  }

  @Get(':id')
  @V2Permission('exams.read')
  detail(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.quizzes.detail(user, actor, parseId(id, 'Test'));
  }

  @Post()
  @V2Roles(...LMS_WRITERS)
  @V2Permission('exams.create')
  create(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Body() payload: CreateQuizDto,
    @ActiveBranch() branchId: number | null,
  ) {
    return this.quizzes.create(user, actor, payload, branchId);
  }

  @Patch(':id')
  @V2Roles(...LMS_WRITERS)
  @V2Permission('exams.update')
  update(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: UpdateQuizDto,
  ) {
    return this.quizzes.update(user, actor, parseId(id, 'Test'), payload);
  }

  @Delete(':id')
  @HttpCode(204)
  @V2Roles(...LMS_WRITERS)
  @V2Permission('exams.delete')
  remove(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.quizzes.remove(user, actor, parseId(id, 'Test'));
  }

  @Post(':id/questions')
  @V2Roles(...LMS_WRITERS)
  @V2Permission('exams.update')
  @ApiOperation({ summary: 'Savol qo‘shish' })
  addQuestion(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: QuestionDto,
  ) {
    return this.quizzes.addQuestion(user, actor, parseId(id, 'Test'), payload);
  }

  @Put(':id/questions/:questionId')
  @V2Roles(...LMS_WRITERS)
  @V2Permission('exams.update')
  updateQuestion(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Body() payload: QuestionDto,
  ) {
    return this.quizzes.updateQuestion(
      user,
      actor,
      parseId(id, 'Test'),
      parseId(questionId, 'Savol'),
      payload,
    );
  }

  @Delete(':id/questions/:questionId')
  @HttpCode(204)
  @V2Roles(...LMS_WRITERS)
  @V2Permission('exams.update')
  removeQuestion(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Param('questionId') questionId: string,
  ) {
    return this.quizzes.removeQuestion(
      user,
      actor,
      parseId(id, 'Test'),
      parseId(questionId, 'Savol'),
    );
  }

  @Post(':id/attempts')
  @V2Permission('exams.update')
  @ApiOperation({ summary: 'O‘quvchi javoblarini qabul qilish va avtomatik baholash' })
  attempt(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: SubmitAttemptDto,
  ) {
    return this.quizzes.submitAttempt(user, actor, parseId(id, 'Test'), payload);
  }

  @Get(':id/results')
  @V2Permission('exams.read')
  @ApiOperation({ summary: 'Test natijalari' })
  results(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.quizzes.results(user, actor, parseId(id, 'Test'));
  }
}

@V2Controller('exam-attempts')
@ApiBearerAuth()
@UseGuards(V2AuthGuard)
@V2Roles(...LMS_WRITERS)
export class LmsExamAttemptsController {
  constructor(private readonly quizzes: LmsQuizzesService) {}

  @Patch(':id/review')
  @V2Permission('grades.update')
  @ApiOperation({ summary: 'Natijani qo‘lda baholash (matnli javoblar)' })
  review(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: ReviewAttemptDto,
  ) {
    return this.quizzes.review(user, actor, parseId(id, 'Natija'), payload);
  }
}

// --- Baholar, progress, dashboard --------------------------------------------------

@V2Controller('grades')
@ApiBearerAuth()
@UseGuards(V2AuthGuard)
@V2Roles(...LMS_READERS)
export class LmsGradesController {
  constructor(private readonly insights: LmsInsightsService) {}

  @Get()
  @V2Permission('grades.read')
  @ApiOperation({ summary: 'Baholar jurnali (topshiriq + test)' })
  list(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Query() query: GradesQueryDto,
  ) {
    return this.insights.grades(user, actor, query);
  }
}

@V2Controller('progress')
@ApiBearerAuth()
@UseGuards(V2AuthGuard)
@V2Roles(...LMS_READERS)
export class LmsProgressController {
  constructor(private readonly insights: LmsInsightsService) {}

  @Get('students/:id')
  @V2Permission('grades.read')
  @ApiOperation({ summary: 'O‘quvchi progressi: davomat, topshiriq, test, kurslar' })
  student(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.insights.studentProgress(user, parseId(id, 'O‘quvchi'));
  }

  @Get('courses/:id')
  @V2Permission('grades.read')
  course(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.insights.courseProgress(user, parseId(id, 'Kurs'));
  }
}

@V2Controller('lms')
@ApiBearerAuth()
@UseGuards(V2AuthGuard)
@V2Roles(...LMS_READERS)
export class LmsSummaryController {
  constructor(private readonly insights: LmsInsightsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'LMS dashboard statistikasi' })
  summary(@CurrentUser() user: RequestUser, @CurrentActor() actor: V2Actor) {
    return this.insights.summary(user, actor);
  }
}

// --- Bildirishnomalar -----------------------------------------------------------------

@V2Controller('notifications')
@ApiBearerAuth()
@UseGuards(V2AuthGuard)
export class LmsNotificationsController {
  constructor(private readonly notifications: LmsNotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Mening bildirishnomalarim' })
  list(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Query() query: NotificationsQueryDto,
  ) {
    return this.notifications.list(user, actor, query);
  }

  @Get('unread-count')
  unread(@CurrentUser() user: RequestUser, @CurrentActor() actor: V2Actor) {
    return this.notifications.unreadCount(user, actor);
  }

  @Post()
  @V2Roles(...LMS_WRITERS, 'operator')
  @V2Permission('notifications.create')
  @ApiOperation({ summary: 'Bildirishnoma yuborish' })
  create(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Body() payload: CreateNotificationDto,
    @ActiveBranch() branchId: number | null,
  ) {
    return this.notifications.create(user, actor, payload, branchId);
  }

  @Post('read-all')
  @HttpCode(200)
  readAll(@CurrentUser() user: RequestUser, @CurrentActor() actor: V2Actor) {
    return this.notifications.markAllRead(user, actor);
  }

  @Patch(':id/read')
  read(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.notifications.markRead(user, actor, parseId(id, 'Bildirishnoma'));
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.notifications.remove(user, actor, parseId(id, 'Bildirishnoma'));
  }
}

// --- Umumiy fayl yuklash ----------------------------------------------------------------

@V2Controller('uploads')
@ApiBearerAuth()
@UseGuards(V2AuthGuard)
@V2Roles(...LMS_READERS)
export class LmsUploadsController {
  constructor(
    private readonly files: V2FilesService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @upload()
  @ApiOperation({ summary: 'Fayl yuklash (8 MB gacha)' })
  async create(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: UploadedBlob | undefined,
  ) {
    const stored = await this.files.save(file, user.organizationId ?? null, MATERIAL_MIME_TYPES);
    return {
      data: {
        id: toId(stored.id),
        mime_type: stored.mimeType,
        size: stored.size,
        url: `/uploads/${stored.id}`,
      },
    };
  }

  @Get(':id')
  async download(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const fileId = parseId(id, 'Fayl');
    const row = await this.prisma.storedFile.findUnique({
      where: { id: fileId },
      select: { organizationId: true },
    });
    if (!row || (user.organizationId && row.organizationId !== user.organizationId)) {
      throw new NotFoundException('Fayl topilmadi');
    }
    return this.files.stream(fileId);
  }
}

export const LMS_CONTROLLERS = [
  LmsSubjectsController,
  LmsCourseCurriculumController,
  LmsModulesController,
  LmsCourseLessonsController,
  LmsMaterialsController,
  LmsAssignmentsController,
  LmsSubmissionsController,
  LmsExamsController,
  LmsExamAttemptsController,
  LmsGradesController,
  LmsProgressController,
  LmsSummaryController,
  LmsNotificationsController,
  LmsUploadsController,
];
