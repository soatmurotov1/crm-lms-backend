import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
  Put,
  Query,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { AuthGuard } from 'src/common/guard/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/roles.guard';
import { Roles } from 'src/common/guard/decarator.roles';
import { Role } from '@prisma/client';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import {
  CurrentUser,
  type RequestUser,
} from 'src/common/guard/current-user.decorator';

@Controller('attendance')
@ApiBearerAuth()
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  // ':lessonId' dan oldin turishi kerak, aks holda marshrut chalkashishi mumkin.
  @ApiOperation({
    summary: `${Role.ADMIN}, ${Role.SUPERADMIN}, ${Role.TEACHER}`,
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.TEACHER, Role.MANAGEMENT)
  @Get('stats/weekly')
  getWeeklyStats(
    @CurrentUser() user: RequestUser,
    @Query('groupId') groupId?: string,
  ) {
    return this.attendanceService.getWeeklyStats(
      user,
      groupId ? Number(groupId) : undefined,
    );
  }

  @ApiOperation({
    summary: `${Role.ADMIN}, ${Role.SUPERADMIN}, ${Role.TEACHER}`,
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.TEACHER)
  @Get(':lessonId')
  getAttendanceByLesson(
    @Param('lessonId', ParseIntPipe) lessonId: number,
    @CurrentUser() user: RequestUser,
  ) {
    return this.attendanceService.getAttendanceByLesson(lessonId, user);
  }

  @ApiOperation({ summary: `${Role.ADMIN}, ${Role.TEACHER}` })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.TEACHER)
  @Post()
  createAttendance(
    @Body() payload: CreateAttendanceDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.attendanceService.createAttendance(payload, user);
  }

  @ApiOperation({ summary: `${Role.ADMIN}, ${Role.TEACHER}` })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.TEACHER)
  @Put()
  updateAttendance(
    @Body() payload: UpdateAttendanceDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.attendanceService.updateAttendance(payload, user);
  }
}
