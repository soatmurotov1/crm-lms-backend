import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Role } from '@prisma/client';
import { AuthGuard } from 'src/common/guard/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/roles.guard';
import { Roles } from 'src/common/guard/decarator.roles';
import {
  CloudinaryService,
  DOCUMENT_MIME_TYPES,
} from 'src/common/cloudinary/cloudinary.service';
import { ExamsService } from './exams.service';
import { CreateExamDto } from './dto/create-exam.dto';
import { UpdateExamDto } from './dto/update-exam.dto';
import { ExamResponseDto } from './dto/exam-response.dto';
import {
  CurrentUser,
  type RequestUser,
} from 'src/common/guard/current-user.decorator';

const examFileInterceptor = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const examBodySchema = {
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      groupId: { type: 'number' },
      lessonId: { type: 'number', nullable: true },
      startAt: { type: 'string', format: 'date-time', nullable: true },
      endAt: { type: 'string', format: 'date-time', nullable: true },
      description: { type: 'string', nullable: true },
      durationTime: { type: 'number', nullable: true },
      maxScore: { type: 'number', nullable: true },
      file: { type: 'string', format: 'binary', nullable: true },
    },
  },
};

const examResponseBodySchema = {
  schema: {
    type: 'object',
    properties: {
      examId: { type: 'number' },
      comment: { type: 'string', nullable: true },
      title: { type: 'string', nullable: true },
      file: { type: 'string', format: 'binary', nullable: true },
    },
  },
};

@Controller('exams')
@ApiBearerAuth()
export class ExamsController {
  constructor(
    private readonly examsService: ExamsService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @ApiOperation({
    summary: `${Role.ADMIN}, ${Role.SUPERADMIN}, ${Role.TEACHER}, ${Role.STUDENT}`,
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.TEACHER, Role.STUDENT)
  @Get('group/:groupId')
  getExamsByGroup(
    @Param('groupId', ParseIntPipe) groupId: number,
    @CurrentUser() user: RequestUser,
  ) {
    return this.examsService.getExamsByGroup(groupId, user);
  }

  @ApiOperation({ summary: `${Role.STUDENT}` })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Get('response/mine/:examId')
  getMyResponse(
    @Param('examId', ParseIntPipe) examId: number,
    @CurrentUser() user: RequestUser,
  ) {
    return this.examsService.getMyResponse(examId, user);
  }

  @ApiOperation({
    summary: `${Role.TEACHER}, ${Role.ADMIN}, ${Role.SUPERADMIN}, ${Role.MANAGEMENT}`,
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN, Role.SUPERADMIN, Role.MANAGEMENT)
  @Get('response/:examId/student/:studentId')
  getStudentResponse(
    @Param('examId', ParseIntPipe) examId: number,
    @Param('studentId', ParseIntPipe) studentId: number,
    @CurrentUser() user: RequestUser,
  ) {
    return this.examsService.getStudentResponse(examId, studentId, user);
  }

  @ApiOperation({ summary: `${Role.STUDENT}` })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @ApiConsumes('multipart/form-data')
  @ApiBody(examResponseBodySchema)
  @UseInterceptors(examFileInterceptor)
  @Post('response')
  createResponse(
    @Body() payload: ExamResponseDto,
    @CurrentUser() user: RequestUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.examsService.createResponse(payload, user, file);
  }

  @ApiOperation({ summary: `${Role.STUDENT}` })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @ApiConsumes('multipart/form-data')
  @ApiBody(examResponseBodySchema)
  @UseInterceptors(examFileInterceptor)
  @Put('response')
  updateResponse(
    @Body() payload: ExamResponseDto,
    @CurrentUser() user: RequestUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.examsService.updateResponse(payload, user, file);
  }

  @ApiOperation({
    summary: `${Role.ADMIN}, ${Role.SUPERADMIN}, ${Role.TEACHER}`,
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.TEACHER)
  @ApiConsumes('multipart/form-data')
  @ApiBody(examBodySchema)
  @UseInterceptors(examFileInterceptor)
  @Post()
  async createExam(
    @Body() payload: CreateExamDto,
    @CurrentUser() user: RequestUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    let fileUrl: string | undefined;
    if (file) {
      fileUrl = await this.cloudinaryService.uploadFile(
        file,
        'exams',
        DOCUMENT_MIME_TYPES,
      );
    }
    return this.examsService.createExam(payload, user, fileUrl);
  }

  @ApiOperation({
    summary: `${Role.ADMIN}, ${Role.SUPERADMIN}, ${Role.TEACHER}`,
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.TEACHER)
  @ApiConsumes('multipart/form-data')
  @ApiBody(examBodySchema)
  @UseInterceptors(examFileInterceptor)
  @Patch(':examId')
  async updateExam(
    @Param('examId', ParseIntPipe) examId: number,
    @Body() payload: UpdateExamDto,
    @CurrentUser() user: RequestUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    let fileUrl: string | undefined;
    if (file) {
      fileUrl = await this.cloudinaryService.uploadFile(
        file,
        'exams',
        DOCUMENT_MIME_TYPES,
      );
    }
    return this.examsService.updateExam(examId, payload, user, fileUrl);
  }

  @ApiOperation({
    summary: `${Role.ADMIN}, ${Role.SUPERADMIN}, ${Role.TEACHER}`,
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.TEACHER)
  @Delete(':examId')
  deleteExam(
    @Param('examId', ParseIntPipe) examId: number,
    @CurrentUser() user: RequestUser,
  ) {
    return this.examsService.deleteExam(examId, user);
  }

  @ApiOperation({
    summary: `${Role.ADMIN}, ${Role.SUPERADMIN}, ${Role.TEACHER}, ${Role.STUDENT}`,
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.TEACHER, Role.STUDENT)
  @Get(':examId')
  getExamById(
    @Param('examId', ParseIntPipe) examId: number,
    @CurrentUser() user: RequestUser,
  ) {
    return this.examsService.getExamById(examId, user);
  }
}
