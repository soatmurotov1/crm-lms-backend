import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { CloudinaryModule } from 'src/common/cloudinary/cloudinary.module';
import { PrismaModule } from 'src/common/prisma/prisma.module';
import { MailerService } from 'src/common/email/mailer.service';

@Module({
  imports: [CloudinaryModule, PrismaModule],
  controllers: [UsersController],
  providers: [UsersService, MailerService],
})
export class UsersModule {}
