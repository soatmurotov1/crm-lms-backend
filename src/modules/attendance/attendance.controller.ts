import { Controller, Get, Post, Body, Param, UseGuards, Req, ParseIntPipe, Put, Delete } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { AuthGuard } from 'src/common/guard/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/roles.guard';
import { Roles } from 'src/common/guard/decarator.roles';
import { Role } from '@prisma/client';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';

@Controller('attendance')
@ApiBearerAuth()
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}


  @ApiOperation({ summary: `${Role.ADMIN}, ${Role.SUPERADMIN}, ${Role.TEACHER}`})
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.TEACHER)
  @Get(":lessonId")
  getAttendanceByLesson(@Param("lessonId", ParseIntPipe) lessonId: number) {
    return this.attendanceService.getAttendanceByLesson(lessonId)
  }


  @ApiOperation({ summary: `${Role.ADMIN}, ${Role.TEACHER}`})
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.TEACHER)
  @Post()
  createAttendance(
    @Body() payload: CreateAttendanceDto,
    @Req() req: Request
  ) {
    return this.attendanceService.createAttendance(payload, req["user"])
  }

  @ApiOperation({ summary: `${Role.ADMIN}, ${Role.TEACHER}`})
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.TEACHER)
  @Put()
  updateAttendance(
    @Body() payload: UpdateAttendanceDto,
    @Req() req: Request
  ) {
    return this.attendanceService.updateAttendance(payload, req["user"])
  }
}
