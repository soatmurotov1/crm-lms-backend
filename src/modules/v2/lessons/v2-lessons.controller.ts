import {
  Body,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  CurrentUser,
  type RequestUser,
} from 'src/common/guard/current-user.decorator';
import {
  ActiveBranch,
  CurrentActor,
  V2AuthGuard,
  V2Permission,
  V2Roles,
  type V2Actor,
} from '../common/v2-auth.guard';
import { V2Controller } from '../common/v2-controller.decorator';
import { parseId } from '../common/v2.mapper';
import {
  V2AttendanceHistoryQueryDto,
  V2BatchAttendanceDto,
  V2CalendarQueryDto,
  V2CreateLessonDto,
  V2CreateTemplateDto,
  V2GenerateLessonsDto,
  V2LessonsQueryDto,
  V2UpdateLessonDto,
  V2UpdateTemplateDto,
} from './v2-lessons.dto';
import { V2LessonsService } from './v2-lessons.service';
import { V2ScheduleService } from './v2-schedule.service';

/** Buxgalterdan boshqa barcha rollar. */
const OPERATIONAL = ['dev', 'owner', 'manager', 'operator', 'teacher'] as const;
const OPS = ['dev', 'owner', 'manager', 'operator'] as const;

@V2Controller('lessons')
@ApiBearerAuth()
@UseGuards(V2AuthGuard)
@V2Roles(...OPERATIONAL)
export class V2LessonsController {
  constructor(private readonly lessons: V2LessonsService) {}

  @Get()
  @V2Permission('lessons.read')
  @ApiOperation({ summary: 'Darslar ro‘yxati' })
  list(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Query() query: V2LessonsQueryDto,
    @ActiveBranch() branchId: number | null,
  ) {
    return this.lessons.list(user, actor, query, branchId);
  }

  @Get(':id')
  @V2Permission('lessons.read')
  @ApiOperation({ summary: 'Dars va uning davomati' })
  detail(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.lessons.detail(user, actor, parseId(id, 'Dars'));
  }

  @Post()
  @V2Permission('lessons.create')
  @ApiOperation({ summary: 'Dars yaratish' })
  create(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Body() payload: V2CreateLessonDto,
  ) {
    return this.lessons.create(user, actor, payload);
  }

  @Patch(':id')
  @V2Roles('dev', 'owner', 'manager', 'teacher')
  @V2Permission('lessons.update')
  @ApiOperation({ summary: 'Darsni tahrirlash' })
  update(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: V2UpdateLessonDto,
  ) {
    return this.lessons.update(user, actor, parseId(id, 'Dars'), payload);
  }

  @Delete(':id')
  @HttpCode(204)
  @V2Roles('dev', 'owner', 'manager', 'teacher')
  @V2Permission('lessons.delete')
  @ApiOperation({ summary: 'Darsni o‘chirish' })
  remove(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.lessons.remove(user, actor, parseId(id, 'Dars'));
  }
}

@V2Controller('attendance')
@ApiBearerAuth()
@UseGuards(V2AuthGuard)
@V2Roles(...OPERATIONAL)
export class V2AttendanceController {
  constructor(private readonly lessons: V2LessonsService) {}

  @Get()
  @V2Permission('attendance.read')
  @ApiOperation({ summary: 'O‘quvchining davomat tarixi' })
  history(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Query() query: V2AttendanceHistoryQueryDto,
  ) {
    return this.lessons.history(user, actor, query);
  }

  @Post('batch')
  @V2Permission('attendance.mark')
  @ApiOperation({ summary: 'Darsning davomatini saqlash' })
  batch(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Body() payload: V2BatchAttendanceDto,
  ) {
    return this.lessons.batch(user, actor, payload);
  }
}

@V2Controller('schedule')
@ApiBearerAuth()
@UseGuards(V2AuthGuard)
@V2Roles(...OPERATIONAL)
export class V2ScheduleController {
  constructor(private readonly schedule: V2ScheduleService) {}

  @Get('templates')
  @V2Permission('schedule.read')
  @ApiOperation({ summary: 'Haftalik jadval shablonlari' })
  templates(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @ActiveBranch() branchId: number | null,
  ) {
    return this.schedule.templates(user, actor, branchId);
  }

  @Post('templates')
  @V2Roles(...OPS)
  @V2Permission('schedule.create')
  @ApiOperation({ summary: 'Jadval shabloni qo‘shish' })
  createTemplate(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Body() payload: V2CreateTemplateDto,
  ) {
    return this.schedule.createTemplate(user, actor, payload);
  }

  @Patch('templates/:id')
  @V2Roles(...OPS)
  @V2Permission('schedule.update')
  @ApiOperation({ summary: 'Jadval shablonini tahrirlash' })
  updateTemplate(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: V2UpdateTemplateDto,
  ) {
    return this.schedule.updateTemplate(
      user,
      actor,
      parseId(id, 'Jadval'),
      payload,
    );
  }

  @Delete('templates/:id')
  @HttpCode(204)
  @V2Roles(...OPS)
  @V2Permission('schedule.delete')
  @ApiOperation({ summary: 'Jadval shablonini o‘chirish' })
  deleteTemplate(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.schedule.deleteTemplate(user, actor, parseId(id, 'Jadval'));
  }

  @Post('generate')
  @V2Roles(...OPS)
  @V2Permission('schedule.create')
  @ApiOperation({ summary: 'Shablonlar bo‘yicha darslarni yaratish' })
  generate(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Body() payload: V2GenerateLessonsDto,
    @ActiveBranch() branchId: number | null,
  ) {
    return this.schedule.generate(user, actor, payload, branchId);
  }

  @Get('calendar')
  @V2Permission('schedule.read')
  @ApiOperation({ summary: 'Kalendar: oraliqdagi darslar' })
  calendar(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Query() query: V2CalendarQueryDto,
    @ActiveBranch() branchId: number | null,
  ) {
    return this.schedule.calendar(user, actor, query, branchId);
  }
}
