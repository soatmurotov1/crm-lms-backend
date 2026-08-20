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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthGuard } from 'src/common/guard/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/roles.guard';
import { Roles } from 'src/common/guard/decarator.roles';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import {
  CurrentUser,
  type RequestUser,
} from 'src/common/guard/current-user.decorator';

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
  getMine(@CurrentUser() user: RequestUser, @Query('limit') limit?: string) {
    return this.notificationsService.getMine(
      user,
      limit ? Number(limit) : undefined,
    );
  }

  @ApiOperation({ summary: `${Role.SUPERADMIN}, ${Role.ADMIN}` })
  @Roles(Role.SUPERADMIN, Role.ADMIN, Role.MANAGEMENT, Role.ADMINSTRATOR)
  @Get('all')
  getAll(@CurrentUser() user: RequestUser, @Query('limit') limit?: string) {
    return this.notificationsService.getAll(
      user,
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
  create(
    @Body() payload: CreateNotificationDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.notificationsService.create(payload, user);
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
  markAllAsRead(@CurrentUser() user: RequestUser) {
    return this.notificationsService.markAllAsRead(user);
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
  markAsRead(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: RequestUser,
  ) {
    return this.notificationsService.markAsRead(id, user);
  }

  @ApiOperation({ summary: `${Role.SUPERADMIN}, ${Role.ADMIN}` })
  @Roles(Role.SUPERADMIN, Role.ADMIN, Role.MANAGEMENT, Role.ADMINSTRATOR)
  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: RequestUser,
  ) {
    return this.notificationsService.remove(id, user);
  }
}
