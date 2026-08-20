import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { GroupsService } from './groups.service';
import { Role } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
} from '@nestjs/swagger';
import { AuthGuard } from 'src/common/guard/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/roles.guard';
import { Roles } from 'src/common/guard/decarator.roles';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import {
  CurrentUser,
  type RequestUser,
} from 'src/common/guard/current-user.decorator';

@Controller('groups')
@ApiBearerAuth()
export class GroupsController {
  constructor(private readonly groupService: GroupsService) {}

  @ApiOperation({
    summary: `${Role.SUPERADMIN}, ${Role.ADMIN}, ${Role.TEACHER}`,
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERADMIN', 'TEACHER')
  @Get('students/:groupId')
  getAllStudentGroupById(
    @Param('groupId', ParseIntPipe) groupId: number,
    @CurrentUser() user: RequestUser,
  ) {
    return this.groupService.getAllStudentGroupById(groupId, user);
  }

  @ApiOperation({
    summary: `${Role.SUPERADMIN}, ${Role.ADMIN}, ${Role.TEACHER}, ${Role.STUDENT}`,
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERADMIN', 'TEACHER', 'STUDENT')
  @Get('lesson/:groupId')
  getGroupLessons(
    @Param('groupId', ParseIntPipe) groupId: number,
    @CurrentUser() user: RequestUser,
  ) {
    return this.groupService.getGroupLessons(groupId, user);
  }

  @ApiOperation({
    summary: `${Role.SUPERADMIN}, ${Role.ADMIN}, ${Role.TEACHER}, ${Role.STUDENT}`,
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.TEACHER, Role.STUDENT)
  @Get('all')
  getAllGroup(
    @CurrentUser() user: RequestUser,
    @Query('status') status?: string,
  ) {
    return this.groupService.getAllGroup(user, status);
  }

  @ApiOperation({ summary: `${Role.SUPERADMIN}, ${Role.ADMIN}` })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        teacherId: { type: 'number' },
        roomId: { type: 'number' },
        courseId: { type: 'number' },
        name: { type: 'string' },
        startDate: { type: 'string', example: '2026-03-14' },
        startTime: { type: 'string', example: '10:00' },
        status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'FREEZE'] },
        weekDays: {
          oneOf: [
            { type: 'array', items: { type: 'string' } },
            { type: 'string', example: '["MONDAY","WEDNESDAY"]' },
          ],
        },
      },
    },
  })
  @UseInterceptors(AnyFilesInterceptor())
  @Post()
  createGroup(
    @Body() payload: CreateGroupDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.groupService.createGroup(payload, user);
  }

  @ApiOperation({
    summary: `${Role.SUPERADMIN}, ${Role.ADMIN}, ${Role.TEACHER}`,
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERADMIN', 'TEACHER')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        teacherId: { type: 'number' },
        roomId: { type: 'number' },
        courseId: { type: 'number' },
        name: { type: 'string' },
        startDate: { type: 'string', example: '2026-03-14' },
        startTime: { type: 'string', example: '10:00' },
        status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'FREEZE'] },
        weekDays: {
          oneOf: [
            { type: 'array', items: { type: 'string' } },
            { type: 'string', example: '["MONDAY","WEDNESDAY"]' },
          ],
        },
      },
    },
  })
  @UseInterceptors(AnyFilesInterceptor())
  @Put(':groupId')
  updateGroupById(
    @Param('groupId', ParseIntPipe) groupId: number,
    @Body() payload: UpdateGroupDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.groupService.updateGroupById(groupId, payload, user);
  }

  @ApiOperation({
    summary: `${Role.SUPERADMIN}, ${Role.ADMIN}, ${Role.TEACHER}`,
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERADMIN', 'TEACHER')
  @Delete(':groupId')
  deleteGroupById(
    @Param('groupId', ParseIntPipe) groupId: number,
    @CurrentUser() user: RequestUser,
  ) {
    return this.groupService.deleteGroupById(groupId, user);
  }
}
