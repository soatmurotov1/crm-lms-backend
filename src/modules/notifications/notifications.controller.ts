import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthGuard } from 'src/common/guard/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/roles.guard';
import { Roles } from 'src/common/guard/decarator.roles';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';

@Controller('notifications')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @ApiOperation({ summary: 'Barcha rollar — o‘ziga tegishli xabarnomalar' })
  @Roles(
    Role.SUPERADMIN,
    Role.ADMIN,
    Role.MANAGEMENT,
    Role.ADMINSTRATOR,
    Role.TEACHER,
    Role.STUDENT,
  )
  @Get('mine')
  getMine(@Req() req: Request, @Query('limit') limit?: string) {
    return this.notificationsService.getMine(
      req['user'],
      limit ? Number(limit) : undefined,
    );
  }

  @ApiOperation({ summary: `${Role.SUPERADMIN}, ${Role.ADMIN}` })
  @Roles(Role.SUPERADMIN, Role.ADMIN, Role.MANAGEMENT, Role.ADMINSTRATOR)
  @Get('all')
  getAll(@Req() req: Request, @Query('limit') limit?: string) {
    return this.notificationsService.getAll(
      req['user'],
      limit ? Number(limit) : undefined,
    );
  }

  @ApiOperation({
    summary: `${Role.SUPERADMIN}, ${Role.ADMIN}, ${Role.TEACHER}`,
  })
  @Roles(
    Role.SUPERADMIN,
    Role.ADMIN,
    Role.MANAGEMENT,
    Role.ADMINSTRATOR,
    Role.TEACHER,
  )
  @Post()
  create(@Body() payload: CreateNotificationDto, @Req() req: Request) {
    return this.notificationsService.create(payload, req['user']);
  }

  @ApiOperation({ summary: 'Barcha rollar' })
  @Roles(
    Role.SUPERADMIN,
    Role.ADMIN,
    Role.MANAGEMENT,
    Role.ADMINSTRATOR,
    Role.TEACHER,
    Role.STUDENT,
  )
  @Patch('read/all')
  markAllAsRead(@Req() req: Request) {
    return this.notificationsService.markAllAsRead(req['user']);
  }

  @ApiOperation({ summary: 'Barcha rollar' })
  @Roles(
    Role.SUPERADMIN,
    Role.ADMIN,
    Role.MANAGEMENT,
    Role.ADMINSTRATOR,
    Role.TEACHER,
    Role.STUDENT,
  )
  @Patch(':id/read')
  markAsRead(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.notificationsService.markAsRead(id, req['user']);
  }

  @ApiOperation({ summary: `${Role.SUPERADMIN}, ${Role.ADMIN}` })
  @Roles(Role.SUPERADMIN, Role.ADMIN, Role.MANAGEMENT, Role.ADMINSTRATOR)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.notificationsService.remove(id, req['user']);
  }
}
