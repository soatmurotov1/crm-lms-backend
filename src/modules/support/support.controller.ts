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
import { SupportService } from './support.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ReplyTicketDto } from './dto/reply-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';

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
  getAll(@Req() req: Request, @Query('status') status?: string) {
    return this.supportService.getAll(req['user'], status);
  }

  @ApiOperation({ summary: `${Role.SUPERADMIN}, ${Role.ADMIN}` })
  @Roles(...STAFF_ROLES)
  @Get('summary')
  getSummary() {
    return this.supportService.getSummary();
  }

  @ApiOperation({ summary: 'Barcha rollar' })
  @Roles(...ALL_ROLES)
  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.supportService.getOne(id, req['user']);
  }

  @ApiOperation({ summary: 'Barcha rollar' })
  @Roles(...ALL_ROLES)
  @Post()
  create(@Body() payload: CreateTicketDto, @Req() req: Request) {
    return this.supportService.create(payload, req['user']);
  }

  @ApiOperation({ summary: 'Barcha rollar' })
  @Roles(...ALL_ROLES)
  @Post(':id/reply')
  reply(
    @Param('id', ParseIntPipe) id: number,
    @Body() payload: ReplyTicketDto,
    @Req() req: Request,
  ) {
    return this.supportService.reply(id, payload, req['user']);
  }

  @ApiOperation({ summary: `${Role.SUPERADMIN}, ${Role.ADMIN}` })
  @Roles(...STAFF_ROLES)
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() payload: UpdateTicketDto,
  ) {
    return this.supportService.update(id, payload);
  }

  @ApiOperation({ summary: `${Role.SUPERADMIN}` })
  @Roles(Role.SUPERADMIN)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.supportService.remove(id);
  }
}
