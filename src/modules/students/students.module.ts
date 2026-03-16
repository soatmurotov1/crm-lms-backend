import { Module } from '@nestjs/common';
import { StudentsService } from './students.service';
import { StudentsController } from './students.controller';
import { CloudinaryModule } from 'src/common/cloudinary/cloudinary.module';
import { PrismaModule } from 'src/common/prisma/prisma.module';
import { MailerService } from 'src/common/email/mailer.service';

@Module({
  imports: [CloudinaryModule, PrismaModule],
  controllers: [StudentsController],
  providers: [StudentsService, MailerService],
})
export class StudentsModule {}
