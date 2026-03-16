import { Module } from '@nestjs/common';
import { HomeworkResponseController } from './homework-response.controller';
import { HomeworkResponseService } from './homework-response.service';
import { CloudinaryModule } from 'src/common/cloudinary/cloudinary.module';

@Module({
  imports: [CloudinaryModule],
  controllers: [HomeworkResponseController],
  providers: [HomeworkResponseService]
})
export class HomeworkResponseModule {}
