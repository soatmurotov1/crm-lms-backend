import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthGuard } from 'src/common/guard/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/roles.guard';
import { Roles } from 'src/common/guard/decarator.roles';
import { GradesService } from './grades.service';
import { CreateGradeDto } from './dto/create-grade.dto';
import { UpdateGradeDto } from './dto/update-grade.dto';

const STAFF_ROLES = [
  Role.SUPERADMIN,
  Role.ADMIN,
  Role.MANAGEMENT,
  Role.ADMINSTRATOR,
  Role.TEACHER,
];

@Controller('grades')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard)
export class GradesController {
  constructor(private readonly gradesService: GradesService) {}

  @ApiOperation({ summary: `${Role.STUDENT} — o'z baholari` })
  @Roles(Role.STUDENT)
  @Get('mine')
  getMine(@Req() req: Request) {
    return this.gradesService.getMine(req['user']);
  }

  @ApiOperation({ summary: `${Role.ADMIN}, ${Role.TEACHER}` })
  @Roles(...STAFF_ROLES)
  @Get('group/:groupId')
  getByGroup(
    @Param('groupId', ParseIntPipe) groupId: number,
    @Req() req: Request,
  ) {
    return this.gradesService.getByGroup(groupId, req['user']);
  }

  @ApiOperation({ summary: `${Role.ADMIN}, ${Role.TEACHER}, ${Role.STUDENT}` })
  @Roles(...STAFF_ROLES, Role.STUDENT)
  @Get('student/:studentId')
  getByStudent(
    @Param('studentId', ParseIntPipe) studentId: number,
    @Req() req: Request,
  ) {
    return this.gradesService.getByStudent(studentId, req['user']);
  }

  @ApiOperation({ summary: `${Role.ADMIN}, ${Role.TEACHER}` })
  @Roles(...STAFF_ROLES)
  @Post()
  create(@Body() payload: CreateGradeDto, @Req() req: Request) {
    return this.gradesService.create(payload, req['user']);
  }

  @ApiOperation({ summary: `${Role.ADMIN}, ${Role.TEACHER}` })
  @Roles(...STAFF_ROLES)
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() payload: UpdateGradeDto,
    @Req() req: Request,
  ) {
    return this.gradesService.update(id, payload, req['user']);
  }

  @ApiOperation({ summary: `${Role.ADMIN}, ${Role.TEACHER}` })
  @Roles(...STAFF_ROLES)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.gradesService.remove(id, req['user']);
  }
}
