import { Module } from '@nestjs/common';
import { HomeworkService } from './homework.service';
import { HomeworkController } from './homework.controller';
import { CloudinaryModule } from 'src/common/cloudinary/cloudinary.module';
import { HomeworkResultsModule } from './homework-results/homework-results.module';
import { HomeworkResponseModule } from './homework-response/homework-response.module';

@Module({
  imports: [CloudinaryModule, HomeworkResultsModule, HomeworkResponseModule],
  controllers: [HomeworkController],
  providers: [HomeworkService],
})
export class HomeworkModule {}
