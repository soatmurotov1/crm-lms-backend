import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/common/prisma/prisma.module';
import { GradesController } from './grades.controller';
import { GradesService } from './grades.service';

@Module({
  imports: [PrismaModule],
  controllers: [GradesController],
  providers: [GradesService],
})
export class GradesModule {}
