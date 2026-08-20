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
import { SupportService } from './support.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ReplyTicketDto } from './dto/reply-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import {
  CurrentUser,
  type RequestUser,
} from 'src/common/guard/current-user.decorator';

const ALL_ROLES = [
  Role.SUPERADMIN,
  Role.ADMIN,
  Role.MANAGEMENT,
  Role.ADMINSTRATOR,
  Role.TEACHER,
  Role.STUDENT,
];

const STAFF_ROLES = [
  Role.SUPERADMIN,
  Role.ADMIN,
  Role.MANAGEMENT,
  Role.ADMINSTRATOR,
];

@Controller('support')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard)
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @ApiOperation({ summary: 'Barcha rollar (xodim bo‘lmasa — faqat o‘ziniki)' })
  @Roles(...ALL_ROLES)
  @Get('all')
  getAll(@CurrentUser() user: RequestUser, @Query('status') status?: string) {
    return this.supportService.getAll(user, status);
  }

  @ApiOperation({ summary: `${Role.SUPERADMIN}, ${Role.ADMIN}` })
  @Roles(...STAFF_ROLES)
  @Get('summary')
  getSummary(@CurrentUser() user: RequestUser) {
    return this.supportService.getSummary(user);
  }

  @ApiOperation({ summary: 'Barcha rollar' })
  @Roles(...ALL_ROLES)
  @Get(':id')
  getOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: RequestUser,
  ) {
    return this.supportService.getOne(id, user);
  }

  @ApiOperation({ summary: 'Barcha rollar' })
  @Roles(...ALL_ROLES)
  @Post()
  create(@Body() payload: CreateTicketDto, @CurrentUser() user: RequestUser) {
    return this.supportService.create(payload, user);
  }

  @ApiOperation({ summary: 'Barcha rollar' })
  @Roles(...ALL_ROLES)
  @Post(':id/reply')
  reply(
    @Param('id', ParseIntPipe) id: number,
    @Body() payload: ReplyTicketDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.supportService.reply(id, payload, user);
  }

  @ApiOperation({ summary: `${Role.SUPERADMIN}, ${Role.ADMIN}` })
  @Roles(...STAFF_ROLES)
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() payload: UpdateTicketDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.supportService.update(id, payload, user);
  }

  @ApiOperation({ summary: `${Role.SUPERADMIN}` })
  @Roles(Role.SUPERADMIN)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.supportService.remove(id);
  }
}
