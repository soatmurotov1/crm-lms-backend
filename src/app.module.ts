import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { UsersModule } from './modules/users/users.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { SessionModule } from './common/session/session.module';
import { OrgAccessModule } from './common/utils/org-access.module';
import { SmsModule } from './common/sms/sms.module';
import { AuthModule } from './modules/auth/auth.module';
import { StudentsModule } from './modules/students/students.module';
import { RoomsModule } from './modules/rooms/rooms.module';
import { LessonsModule } from './modules/lessons/lessons.module';
import { TeachersModule } from './modules/teaches/teaches.module';
import { UserSeeder } from './common/seed/user.seed';
import { CourseModule } from './modules/course/course.module';
import { GroupsModule } from './modules/groups/groups.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { HomeworkModule } from './modules/homework/homework.module';
import { LessonVideosModule } from './modules/lesson-videos/lesson-videos.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ScheduleModule } from '@nestjs/schedule';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { PlansModule } from './modules/plans/plans.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SupportModule } from './modules/support/support.module';
import { GradesModule } from './modules/grades/grades.module';
import { ExamsModule } from './modules/exams/exams.module';
import { LeadsModule } from './modules/leads/leads.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { BranchesModule } from './modules/branches/branches.module';
import { V2Module } from './modules/v2/v2.module';
import { isSchedulerProcess } from './common/utils/scheduler.util';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot([
      // Panel ochilganda 10-15 so'rov bir vaqtda ketadi, shuning uchun
      // qisqa oynadagi chegara shundan sezilarli kattaroq.
      { name: 'short', ttl: 1000, limit: 30 },
      { name: 'medium', ttl: 60_000, limit: 300 },
    ]),
    ...(isSchedulerProcess() ? [ScheduleModule.forRoot()] : []),
    PrismaModule,
    SessionModule,
    OrgAccessModule,
    SmsModule,
    AuthModule,
    UsersModule,
    TeachersModule,
    StudentsModule,
    CourseModule,
    RoomsModule,
    LessonsModule,
    GroupsModule,
    AttendanceModule,
    HomeworkModule,
    LessonVideosModule,
    PaymentsModule,
    OrganizationsModule,
    PlansModule,
    SubscriptionsModule,
    NotificationsModule,
    SupportModule,
    GradesModule,
    ExamsModule,
    LeadsModule,
    ExpensesModule,
    DashboardModule,
    BranchesModule,
    V2Module,
  ],
  controllers: [],
  providers: [UserSeeder, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
