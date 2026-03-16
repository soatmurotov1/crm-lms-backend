import { Body, Controller, Get, Param, ParseIntPipe, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { LessonVideosService } from './lesson-videos.service';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from 'src/common/guard/decarator.roles';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CreateLessonVideosDto } from './dto/create.lesson-videos.dto';
import { RolesGuard } from 'src/common/guard/roles.guard';
import { AuthGuard } from 'src/common/guard/jwt-auth.guard';
import { CloudinaryService } from 'src/common/cloudinary/cloudinary.service';

@Controller('lesson-videos')
@ApiBearerAuth()
export class LessonVideosController {
  constructor(
    private readonly lessonVideosService: LessonVideosService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @ApiOperation({
    summary: `${Role.ADMIN}, ${Role.SUPERADMIN}, ${Role.TEACHER}`,
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.TEACHER)
  @Get(':groupId')
  getLessonVideosByGroupId(
    @Param('groupId', ParseIntPipe) groupId: number,
    @Req() req: Request,
  ) {
    return this.lessonVideosService.getAllLessonVideosByGroup(
      groupId,
      req['user'],
    );
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
    }),
  )
  @Post()
  async createLessonVideo(
    @Body() payload: CreateLessonVideosDto,
    @Req() req: Request,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    let fileUrl: string | undefined;
    if (file) {
      fileUrl = await this.cloudinaryService.uploadFile(file, 'lesson-videos');
    }

    return this.lessonVideosService.createLessonVideo(
      payload,
      req['user'],
      fileUrl,
    );
  }
}
