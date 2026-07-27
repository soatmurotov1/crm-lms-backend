import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
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
  ],
  controllers: [],
  providers: [UserSeeder],
})
export class AppModule {}
