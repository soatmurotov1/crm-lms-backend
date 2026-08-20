import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { LessonVideosService } from './lesson-videos.service';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from 'src/common/guard/decarator.roles';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CreateLessonVideosDto } from './dto/create.lesson-videos.dto';
import { RolesGuard } from 'src/common/guard/roles.guard';
import { AuthGuard } from 'src/common/guard/jwt-auth.guard';
import { CloudinaryService } from 'src/common/cloudinary/cloudinary.service';
import {
  CurrentUser,
  type RequestUser,
} from 'src/common/guard/current-user.decorator';

@Controller('lesson-videos')
@ApiBearerAuth()
export class LessonVideosController {
  constructor(
    private readonly lessonVideosService: LessonVideosService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @ApiOperation({
    summary: `${Role.ADMIN}, ${Role.SUPERADMIN}, ${Role.TEACHER}, ${Role.STUDENT}`,
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.TEACHER, Role.STUDENT)
  @Get(':groupId')
  getLessonVideosByGroupId(
    @Param('groupId', ParseIntPipe) groupId: number,
    @CurrentUser() user: RequestUser,
  ) {
    return this.lessonVideosService.getAllLessonVideosByGroup(groupId, user);
  }

  @ApiOperation({
    summary: `${Role.ADMIN}, ${Role.SUPERADMIN}, ${Role.TEACHER}`,
  })
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.TEACHER)
  @UseGuards(AuthGuard, RolesGuard)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        groupId: { type: 'number' },
        lessonId: { type: 'number' },
        file: { type: 'string', format: 'binary', nullable: true },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 200 * 1024 * 1024 },
    }),
  )
  @Post()
  async createLessonVideo(
    @Body() payload: CreateLessonVideosDto,
    @CurrentUser() user: RequestUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    let fileUrl: string | undefined;
    if (file) {
      fileUrl = await this.cloudinaryService.uploadVideo(file);
    }

    return this.lessonVideosService.createLessonVideo(payload, user, fileUrl);
  }

  @ApiOperation({
    summary: `${Role.ADMIN}, ${Role.SUPERADMIN}, ${Role.TEACHER}`,
  })
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.TEACHER)
  @UseGuards(AuthGuard, RolesGuard)
  @Delete(':id')
  deleteLessonVideo(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: RequestUser,
  ) {
    return this.lessonVideosService.deleteLessonVideo(id, user);
  }
}
