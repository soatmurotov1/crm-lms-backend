import { Module } from '@nestjs/common';
import {
  V2AuditController,
  V2AuditLogsService,
} from './audit/v2-audit.controller';
import { V2AuthController } from './auth/v2-auth.controller';
import { V2AuthService } from './auth/v2-auth.service';
import { V2BranchesController } from './branches/v2-branches.controller';
import { V2BranchesService } from './branches/v2-branches.service';
import { V2AuditService } from './common/v2-audit.service';
import { V2AuthGuard } from './common/v2-auth.guard';
import { V2BalanceService } from './common/v2-balance.service';
import { V2FilesService } from './common/v2-files.service';
import { V2LedgerService } from './common/v2-ledger.service';
import { V2ScopeService } from './common/v2-scope.service';
import { V2StaffService } from './common/v2-staff.service';
import { V2CoursesController } from './courses/v2-courses.controller';
import { V2CoursesService } from './courses/v2-courses.service';
import { V2DashboardController } from './dashboard/v2-dashboard.controller';
import { V2DashboardService } from './dashboard/v2-dashboard.service';
import {
  V2ExpensesController,
  V2TeacherSettlementsController,
} from './expenses/v2-expenses.controller';
import { V2ExpensesService } from './expenses/v2-expenses.service';
import {
  V2LeadSourcesController,
  V2LeadStagesController,
  V2LeadsController,
} from './leads/v2-leads.controller';
import { V2LeadsService } from './leads/v2-leads.service';
import { V2DocumentsController } from './documents/v2-documents.controller';
import { V2DocumentsService } from './documents/v2-documents.service';
import { V2TelegramController } from './telegram/v2-telegram.controller';
import { V2TelegramService } from './telegram/v2-telegram.service';
import { V2GroupsController } from './groups/v2-groups.controller';
import { V2GroupsService } from './groups/v2-groups.service';
import {
  V2AttendanceController,
  V2LessonsController,
  V2ScheduleController,
} from './lessons/v2-lessons.controller';
import { V2LessonsService } from './lessons/v2-lessons.service';
import { V2ScheduleService } from './lessons/v2-schedule.service';
import { V2PaymentsController } from './payments/v2-payments.controller';
import { V2PaymentsService } from './payments/v2-payments.service';
import { V2SearchController } from './search/v2-search.controller';
import { V2SearchService } from './search/v2-search.service';
import { V2StudentsController } from './students/v2-students.controller';
import { V2StudentMapper } from './students/v2-students.mapper';
import { V2StudentsService } from './students/v2-students.service';
import { V2OptionsService } from './users/v2-options.service';
import {
  V2PermissionsController,
  V2UsersController,
} from './users/v2-users.controller';
import { V2UsersService } from './users/v2-users.service';
import { LmsAccessService } from './lms/lms-access.service';
import { LmsAssignmentsService } from './lms/assignments.service';
import { LmsCurriculumService } from './lms/curriculum.service';
import { LmsInsightsService } from './lms/insights.service';
import { LMS_CONTROLLERS } from './lms/lms.controllers';
import { LmsNotificationsService } from './lms/notifications.service';
import { LmsQuizzesService } from './lms/quizzes.service';
import { LmsSubjectsService } from './lms/subjects.service';

/**
 * `/api/v2` — LMS platformasi frontendi (`frontend`) uchun API.
 *
 * Frontend kodi o'zgarmaydi: bu qatlam uning shartnomasiga moslashadi
 * (email bilan kirish, cookie'dagi sessiya, `snake_case` maydonlar, matnli
 * id'lar, `X-Branch-Id`). Eski `/api/...` endpointlari — mobil ilova va
 * avvalgi panel uchun — o'z holicha qoladi.
 *
 * `PrismaModule`, `SessionModule` va `JwtModule` global, shuning uchun bu
 * yerda import qilinmaydi.
 */
@Module({
  controllers: [
    V2AuthController,
    V2BranchesController,
    V2SearchController,
    V2DashboardController,
    V2CoursesController,
    V2GroupsController,
    V2StudentsController,
    V2PaymentsController,
    V2LessonsController,
    V2AttendanceController,
    V2ScheduleController,
    V2UsersController,
    V2PermissionsController,
    V2AuditController,
    V2ExpensesController,
    V2TeacherSettlementsController,
    V2LeadsController,
    V2LeadStagesController,
    V2LeadSourcesController,
    V2TelegramController,
    V2DocumentsController,
    // LMS
    ...LMS_CONTROLLERS,
  ],
  providers: [
    // Umumiy qatlam
    V2AuthGuard,
    V2ScopeService,
    V2BalanceService,
    V2AuditService,
    V2StaffService,
    V2FilesService,
    V2LedgerService,
    V2StudentMapper,
    // Modullar
    V2AuthService,
    V2BranchesService,
    V2SearchService,
    V2DashboardService,
    V2CoursesService,
    V2GroupsService,
    V2StudentsService,
    V2PaymentsService,
    V2LessonsService,
    V2ScheduleService,
    V2UsersService,
    V2OptionsService,
    V2AuditLogsService,
    V2ExpensesService,
    V2LeadsService,
    V2TelegramService,
    V2DocumentsService,
    // LMS
    LmsAccessService,
    LmsSubjectsService,
    LmsCurriculumService,
    LmsAssignmentsService,
    LmsQuizzesService,
    LmsInsightsService,
    LmsNotificationsService,
  ],
})
export class V2Module {}
