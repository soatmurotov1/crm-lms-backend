import { Module } from '@nestjs/common';
import { TeachersController } from './teaches.controller';
import { TeachersService } from './teaches.service';
import { CloudinaryModule } from 'src/common/cloudinary/cloudinary.module';
import { PrismaModule } from 'src/common/prisma/prisma.module';
import { AuthModule } from 'src/modules/auth/auth.module';

@Module({
  imports: [CloudinaryModule, PrismaModule, AuthModule],
  controllers: [TeachersController],
  providers: [TeachersService],
})
export class TeachersModule {}
