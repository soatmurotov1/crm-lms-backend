import { Module } from '@nestjs/common';
import { HomeworkResultsController } from './homework-results.controller';
import { HomeworkResultsService } from './homework-results.service';

@Module({
  controllers: [HomeworkResultsController],
  providers: [HomeworkResultsService]
})
export class HomeworkResultsModule {}
