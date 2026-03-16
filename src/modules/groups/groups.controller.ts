import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { Role } from '@prisma/client';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from 'src/common/guard/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/roles.guard';
import { Roles } from 'src/common/guard/decarator.roles';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { AnyFilesInterceptor } from '@nestjs/platform-express';

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
  getAllStudentGroupById(@Param('groupId', ParseIntPipe) groupId: number) {
    return this.groupService.getAllStudentGroupById(groupId);
  }

  @ApiOperation({
    summary: `${Role.SUPERADMIN}, ${Role.ADMIN}, ${Role.TEACHER}`,
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERADMIN', 'TEACHER')
  @Get('lesson/:groupId')
  getGroupLessons(
    @Param('groupId', ParseIntPipe) groupId: number,
    @Req() req: Request,
  ) {
    return this.groupService.getGroupLessons(groupId, req['user']);
  }

  @ApiOperation({summary: `${Role.SUPERADMIN}, ${Role.ADMIN}, ${Role.TEACHER}`})
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.TEACHER)
  @Get('all')
  getAllGroup(@Req() req: Request) {
    return this.groupService.getAllGroup(req['user'])
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
            { type: 'string', example: '["MONDAY","WEDNESDAY"]' }
          ]
        }
      }
    }
  })
  @UseInterceptors(AnyFilesInterceptor())
  @Post()
  createGroup(@Body() payload: CreateGroupDto, @Req() req: Request) {
    return this.groupService.createGroup(payload, req['user']);
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
            { type: 'string', example: '["MONDAY","WEDNESDAY"]' }
          ]
        }
      }
    }
  })
  @UseInterceptors(AnyFilesInterceptor())
  @Put(':groupId')
  updateGroupById(
    @Param('groupId', ParseIntPipe) groupId: number,
    @Body() payload: UpdateGroupDto,
    @Req() req: Request
  ) {
    return this.groupService.updateGroupById(groupId, payload, req['user'])
  }

  @ApiOperation({
    summary: `${Role.SUPERADMIN}, ${Role.ADMIN}, ${Role.TEACHER}`,
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERADMIN', 'TEACHER')
  @Delete(':groupId')
  deleteGroupById(
    @Param('groupId', ParseIntPipe) groupId: number,
    @Req() req: Request,
  ) {
    return this.groupService.deleteGroupById(groupId, req['user']);
  }
}
