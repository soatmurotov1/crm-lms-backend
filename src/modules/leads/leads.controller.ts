import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthGuard } from 'src/common/guard/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/roles.guard';
import { Roles } from 'src/common/guard/decarator.roles';
import {
  CurrentUser,
  type RequestUser,
} from 'src/common/guard/current-user.decorator';
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto, UpdateLeadStageDto } from './dto/update-lead.dto';
import { LeadQueryDto } from './dto/lead-query.dto';

// Lidlar bilan odatda operator/menejer ishlaydi, shuning uchun barcha
// xodim rollari kiradi.
const LEAD_ROLES = [
  Role.ADMIN,
  Role.SUPERADMIN,
  Role.MANAGEMENT,
  Role.ADMINSTRATOR,
] as const;

@Controller('leads')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard)
@Roles(...LEAD_ROLES)
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @ApiOperation({ summary: LEAD_ROLES.join(', ') })
  @Get('all')
  getAll(@CurrentUser() user: RequestUser, @Query() query: LeadQueryDto) {
    return this.leadsService.getAll(user, query);
  }

  @ApiOperation({ summary: LEAD_ROLES.join(', ') })
  @Get('summary')
  getSummary(@CurrentUser() user: RequestUser) {
    return this.leadsService.getSummary(user);
  }

  @ApiOperation({ summary: LEAD_ROLES.join(', ') })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() payload: CreateLeadDto) {
    return this.leadsService.create(user, payload);
  }

  @ApiOperation({ summary: LEAD_ROLES.join(', ') })
  @Put(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() payload: UpdateLeadDto,
  ) {
    return this.leadsService.update(user, id, payload);
  }

  @ApiOperation({ summary: LEAD_ROLES.join(', ') })
  @Patch(':id/stage')
  updateStage(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() payload: UpdateLeadStageDto,
  ) {
    return this.leadsService.updateStage(user, id, payload.stage);
  }

  @ApiOperation({ summary: LEAD_ROLES.join(', ') })
  @Delete(':id')
  remove(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.leadsService.remove(user, id);
  }
}
