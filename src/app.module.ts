import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { UsersModule } from './modules/users/users.module';
import { PrismaModule } from './common/prisma/prisma.module';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    /*
      Butun API uchun so'rov chegarasi. Buningsiz login'dan boshqa hamma
      endpoint cheksiz chaqirilardi: ma'lumotlarni ko'chirib olish (scraping)
      va oddiy DoS uchun ochiq edi.

      Chegara `req.ip` bo'yicha hisoblanadi — u `trust proxy` sozlangani uchun
      soxtalashtirilgan sarlavhaga emas, haqiqiy manzilga tayanadi.
    */
    ThrottlerModule.forRoot([
      // Panel ochilganda 10-15 so'rov bir vaqtda ketadi, shuning uchun
      // qisqa oynadagi chegara shundan sezilarli kattaroq.
      { name: 'short', ttl: 1000, limit: 30 },
      { name: 'medium', ttl: 60_000, limit: 300 },
    ]),
    ScheduleModule.forRoot(),
    PrismaModule,
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
  ],
  controllers: [],
  providers: [UserSeeder, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
