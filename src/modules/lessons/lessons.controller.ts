import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { ApiBearerAuth, ApiBody, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { RolesGuard } from 'src/common/guard/roles.guard';
import { AuthGuard } from 'src/common/guard/jwt-auth.guard';
import { Roles } from 'src/common/guard/decarator.roles';

@Controller('lessons')
@ApiBearerAuth()
export class LessonsController {
  constructor(private readonly lessonServise: LessonsService) {}

  @ApiOperation({ summary: `${Role.SUPERADMIN}, ${Role.ADMIN}, ${Role.TEACHER}`})
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERADMIN', 'TEACHER')
  @Get('group/:groupId')
  getLessonsByGroupId(
    @Param('groupId', ParseIntPipe) groupId: number,
    @Req() req: Request
  ) {
    return this.lessonServise.getLessonsByGroupId(groupId, req['user']);
  }

  @ApiOperation({ summary: `${Role.SUPERADMIN}, ${Role.ADMIN}, ${Role.TEACHER}`})
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERADMIN', 'TEACHER')
  @Get('/:groupId/:lessonId')
  getOneLessonByGroupIdAndLessonId(
    @Param('groupId', ParseIntPipe) groupId: number,
    @Param('lessonId', ParseIntPipe) lessonId: number,
    @Req() req: Request
  ) {
    return this.lessonServise.getOneLessonByGroupIdAndLessonId(
      groupId,
      lessonId,
      req['user'],
    )
  }

  @ApiOperation({ summary: `${Role.SUPERADMIN}, ${Role.ADMIN}, ${Role.TEACHER}`})
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERADMIN', 'TEACHER')
  @Post()
  createLesson(@Body() payload: CreateLessonDto, @Req() req: Request) {
    return this.lessonServise.createLesson(payload, req['user']);
  }

  @ApiOperation({
    summary: `${Role.SUPERADMIN}, ${Role.ADMIN}, ${Role.TEACHER}`,
  })
  @ApiBody({ type: UpdateLessonDto })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERADMIN', 'TEACHER')
  @Put(':groupId/:lessonId')
  updateLessonById(
    @Param('groupId', ParseIntPipe) groupId: number,
    @Param('lessonId', ParseIntPipe) lessonId: number,
    @Body() payload: UpdateLessonDto,
  ) {
    return this.lessonServise.updateLessonById(groupId, lessonId, payload);
  }

  @ApiOperation({ summary: `${Role.SUPERADMIN}, ${Role.ADMIN}`})
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @Delete(':groupId/:lessonId')
  deleteLessonById(
    @Param('groupId', ParseIntPipe) groupId: number,
    @Param('lessonId', ParseIntPipe) lessonId: number,
    @Req() req: Request,
  ) {
    return this.lessonServise.deleteLessonById(groupId, lessonId, req['user']);
  }
}
