import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from 'src/common/guard/decarator.roles';
import { AuthGuard } from 'src/common/guard/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/roles.guard';
import { CreateStudentGroupDto } from './dto/create.student-group.dto';
import { StudentGroupService } from './student-group.service';

@Controller('student-group')
@ApiBearerAuth()
export class StudentGroupController {
  constructor(private readonly studentGroupServise: StudentGroupService) {}

  @ApiOperation({ summary: `${Role.SUPERADMIN}, ${Role.ADMIN}` })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @Post()
  createStudentGroup(
    @Body() payload: CreateStudentGroupDto,
    @Req() req: Request,
  ) {
    return this.studentGroupServise.createStudentGroup(payload, req['user']);
  }

  @ApiOperation({ summary: `${Role.SUPERADMIN}, ${Role.ADMIN}` })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @Delete()
  deleteStudentGroup(
    @Body() payload: CreateStudentGroupDto,
    @Req() req: Request
  ) {
    return this.studentGroupServise.deleteStudentGroup(payload, req['user']);
  }
}
