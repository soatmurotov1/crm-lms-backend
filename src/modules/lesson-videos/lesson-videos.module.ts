import { Module } from '@nestjs/common';
import { LessonVideosController } from './lesson-videos.controller';
import { LessonVideosService } from './lesson-videos.service';
import { CloudinaryModule } from 'src/common/cloudinary/cloudinary.module';

@Module({
  imports: [CloudinaryModule],
  controllers: [LessonVideosController],
  providers: [LessonVideosService]
})
export class LessonVideosModule {}
