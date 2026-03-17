import {
  Controller,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Req,
  Get,
  Param,
  Query,
  ParseIntPipe,
  Put,
  Delete,
} from '@nestjs/common';
import { HomeworkService } from './homework.service';
import { CreateHomeworkDto } from './dto/create-homework.dto';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { RolesGuard } from 'src/common/guard/roles.guard';
import { AuthGuard } from 'src/common/guard/jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { HomeworkStatus, Role } from '@prisma/client';
import { Roles } from 'src/common/guard/decarator.roles';
import { CloudinaryService } from 'src/common/cloudinary/cloudinary.service';
import { HomeworkStatusDto } from './dto/homework.status.dto';
import { UpdateHomeworkDto } from './dto/update-homework.dto';

@Controller('homework')
@ApiBearerAuth()
export class HomeworkController {
  constructor(
    private readonly homeworkService: HomeworkService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @ApiOperation({
    summary: `${Role.ADMIN}, ${Role.SUPERADMIN}, ${Role.TEACHER}`,
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.TEACHER)
  @Get('group/:groupId')
  getAllHomeworkByGroup(
    @Param('groupId') groupId: number,
    @Req() req: Request,
  ) {
    return this.homeworkService.getAllHomeworkByGroup(groupId, req['user']);
  }

  @ApiOperation({
    summary: `${Role.ADMIN}, ${Role.SUPERADMIN}, ${Role.TEACHER}`,
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN, Role.SUPERADMIN)
  @Get(':homeworkId')
  @ApiQuery({
    name: 'status',
    enum: HomeworkStatus,
    required: true,
  })
  getHomeworkById(
    @Param('homeworkId', ParseIntPipe) homeworkId: number,
    @Query() query: HomeworkStatusDto,
    @Req() req: Request,
  ) {
    return this.homeworkService.getHomeworkById(homeworkId, query, req['user']);
  }

  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        groupId: { type: 'number' },
        lessonId: { type: 'number' },
        durationTime: { type: 'number', example: 16, nullable: true },
        file: { type: 'string', format: 'binary', nullable: true },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.TEACHER)
  @ApiOperation({
    summary: `${Role.SUPERADMIN}, ${Role.ADMIN}, ${Role.TEACHER}`,
  })
  @Post()
  async createHomework(
    @Body() payload: CreateHomeworkDto,
    @Req() req: Request,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    let fileUrl: string | undefined;
    if (file) {
      fileUrl = await this.cloudinaryService.uploadFile(file, 'homeworks');
    }
    return this.homeworkService.createHomework(payload, req['user'], fileUrl);
  }

  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        groupId: { type: 'number' },
        lessonId: { type: 'number' },
        durationTime: { type: 'number', example: 16, nullable: true },
        file: { type: 'string', format: 'binary', nullable: true },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({
    summary: `${Role.SUPERADMIN}, ${Role.ADMIN}`,
  })
  @Put(':homeworkId')
  async updateHomework(
    @Param('homeworkId', ParseIntPipe) homeworkId: number,
    @Body() payload: UpdateHomeworkDto,
    @Req() req: Request,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    let fileUrl: string | undefined;
    if (file) {
      fileUrl = await this.cloudinaryService.uploadFile(file, 'homeworks');
    }
    return this.homeworkService.updateHomework(
      homeworkId,
      payload,
      req['user'],
      fileUrl,
    );
  }

  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        groupId: { type: 'number' },
        lessonId: { type: 'number' },
        durationTime: { type: 'number', example: 16, nullable: true },
        file: { type: 'string', format: 'binary', nullable: true },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @ApiOperation({
    summary: `${Role.TEACHER}`
  })
  @Put('teacher/:homeworkId')
  async updateHomeworkByTeacher(
    @Param('homeworkId', ParseIntPipe) homeworkId: number,
    @Body() payload: UpdateHomeworkDto,
    @Req() req: Request,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    let fileUrl: string | undefined;
    if (file) {
      fileUrl = await this.cloudinaryService.uploadFile(file, 'homeworks');
    }
    return this.homeworkService.updateHomeworkByTeacher(
      homeworkId,
      payload,
      req['user'],
      fileUrl,
    );
  }

  @ApiOperation({
    summary: `${Role.SUPERADMIN}, ${Role.ADMIN}, ${Role.TEACHER}`,
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN, Role.ADMIN, Role.TEACHER)
  @Delete(':homeworkId')
  deleteHomework(
    @Param('homeworkId', ParseIntPipe) homeworkId: number,
    @Req() req: Request,
  ) {
    return this.homeworkService.deleteHomework(homeworkId, req['user']);
  }
}
