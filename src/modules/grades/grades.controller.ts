import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
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
import {
  CurrentUser,
  type RequestUser,
} from 'src/common/guard/current-user.decorator';

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
  getMine(@CurrentUser() user: RequestUser) {
    return this.gradesService.getMine(user);
  }

  @ApiOperation({ summary: `${Role.ADMIN}, ${Role.TEACHER}` })
  @Roles(...STAFF_ROLES)
  @Get('group/:groupId')
  getByGroup(
    @Param('groupId', ParseIntPipe) groupId: number,
    @CurrentUser() user: RequestUser,
  ) {
    return this.gradesService.getByGroup(groupId, user);
  }

  @ApiOperation({ summary: `${Role.ADMIN}, ${Role.TEACHER}, ${Role.STUDENT}` })
  @Roles(...STAFF_ROLES, Role.STUDENT)
  @Get('student/:studentId')
  getByStudent(
    @Param('studentId', ParseIntPipe) studentId: number,
    @CurrentUser() user: RequestUser,
  ) {
    return this.gradesService.getByStudent(studentId, user);
  }

  @ApiOperation({ summary: `${Role.ADMIN}, ${Role.TEACHER}` })
  @Roles(...STAFF_ROLES)
  @Post()
  create(@Body() payload: CreateGradeDto, @CurrentUser() user: RequestUser) {
    return this.gradesService.create(payload, user);
  }

  @ApiOperation({ summary: `${Role.ADMIN}, ${Role.TEACHER}` })
  @Roles(...STAFF_ROLES)
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() payload: UpdateGradeDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.gradesService.update(id, payload, user);
  }

  @ApiOperation({ summary: `${Role.ADMIN}, ${Role.TEACHER}` })
  @Roles(...STAFF_ROLES)
  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: RequestUser,
  ) {
    return this.gradesService.remove(id, user);
  }
}
