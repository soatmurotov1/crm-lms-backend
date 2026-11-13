import {
  Body,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  CurrentUser,
  type RequestUser,
} from 'src/common/guard/current-user.decorator';
import {
  ActiveBranch,
  CurrentActor,
  V2AuthGuard,
  V2Permission,
  V2Roles,
  type V2Actor,
} from '../common/v2-auth.guard';
import { V2Controller } from '../common/v2-controller.decorator';
import { parseId } from '../common/v2.mapper';
import {
  V2AssignLeadDto,
  V2ConvertLeadDto,
  V2CreateLeadActivityDto,
  V2CreateLeadDto,
  V2CreateLeadSourceDto,
  V2LeadDuplicateQueryDto,
  V2LeadMetricsQueryDto,
  V2LeadStageTransitionDto,
  V2LeadsQueryDto,
  V2UpdateLeadActivityDto,
  V2UpdateLeadDto,
  V2UpdateLeadStagesDto,
} from './v2-leads.dto';
import { V2LeadsService } from './v2-leads.service';

/** Lidlar bilan ishlaydiganlar (backend `accessLeads` bilan bir xil). */
const LEAD_ROLES = ['dev', 'owner', 'manager', 'operator'] as const;
const STAGE_ADMINS = ['dev', 'owner', 'manager'] as const;

@V2Controller('leads')
@ApiBearerAuth()
@UseGuards(V2AuthGuard)
@V2Roles(...LEAD_ROLES)
export class V2LeadsController {
  constructor(private readonly leads: V2LeadsService) {}

  @Get()
  @V2Permission('leads.read')
  @ApiOperation({ summary: 'Lidlar ro‘yxati' })
  list(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Query() query: V2LeadsQueryDto,
    @ActiveBranch() branchId: number | null,
  ) {
    return this.leads.list(user, actor, query, branchId);
  }

  @Get('board')
  @V2Permission('leads.read')
  @ApiOperation({ summary: 'Lidlar doskasi (bosqichlar bo‘yicha)' })
  board(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Query() query: V2LeadsQueryDto,
    @ActiveBranch() branchId: number | null,
  ) {
    return this.leads.board(user, actor, query, branchId);
  }

  @Get('metrics')
  @V2Permission('leads.read')
  @ApiOperation({ summary: 'Lidlar statistikasi' })
  metrics(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Query() query: V2LeadMetricsQueryDto,
    @ActiveBranch() branchId: number | null,
  ) {
    return this.leads.metrics(user, actor, query, branchId);
  }

  @Get('check-duplicate')
  @V2Permission('leads.read')
  @ApiOperation({ summary: 'Telefon bo‘yicha takrorni tekshirish' })
  checkDuplicate(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Query() query: V2LeadDuplicateQueryDto,
  ) {
    return this.leads.checkDuplicate(user, actor, query);
  }

  @Post('check-duplicate')
  @HttpCode(200)
  @V2Permission('leads.read')
  @ApiOperation({ summary: 'Telefon bo‘yicha takrorni tekshirish (POST)' })
  checkDuplicatePost(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Body() payload: V2LeadDuplicateQueryDto,
  ) {
    return this.leads.checkDuplicate(user, actor, payload);
  }

  @Get('export.xlsx')
  @V2Permission('leads.read')
  @ApiOperation({ summary: 'Lidlarni eksport qilish (CSV)' })
  async export(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Query() query: V2LeadsQueryDto,
    @ActiveBranch() branchId: number | null,
    @Res({ passthrough: true }) response: Response,
  ) {
    const body = await this.leads.exportCsv(user, actor, query, branchId);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="leads-export.csv"',
    );
    return new StreamableFile(Buffer.from(body, 'utf-8'));
  }

  @Get(':id')
  @V2Permission('leads.read')
  @ApiOperation({ summary: 'Lid' })
  detail(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.leads.detail(user, actor, parseId(id, 'Lid'));
  }

  @Post()
  @V2Permission('leads.create')
  @ApiOperation({ summary: 'Lid qo‘shish' })
  create(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Body() payload: V2CreateLeadDto,
    @ActiveBranch() branchId: number | null,
  ) {
    return this.leads.create(user, actor, payload, branchId);
  }

  @Patch(':id')
  @V2Permission('leads.update')
  @ApiOperation({ summary: 'Lidni tahrirlash' })
  update(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: V2UpdateLeadDto,
  ) {
    return this.leads.update(user, actor, parseId(id, 'Lid'), payload);
  }

  @Delete(':id')
  @HttpCode(204)
  @V2Roles(...STAGE_ADMINS)
  @V2Permission('leads.delete')
  @ApiOperation({ summary: 'Lidni o‘chirish' })
  remove(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.leads.remove(user, actor, parseId(id, 'Lid'));
  }

  @Patch(':id/stage')
  @V2Permission('leads.update')
  @ApiOperation({ summary: 'Lid bosqichini o‘zgartirish' })
  stage(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: V2LeadStageTransitionDto,
  ) {
    return this.leads.transition(user, actor, parseId(id, 'Lid'), payload);
  }

  @Post(':id/stage')
  @HttpCode(200)
  @V2Permission('leads.update')
  @ApiOperation({ summary: 'Lid bosqichini o‘zgartirish (POST)' })
  stagePost(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: V2LeadStageTransitionDto,
  ) {
    return this.leads.transition(user, actor, parseId(id, 'Lid'), payload);
  }

  @Patch(':id/assign')
  @V2Permission('leads.update')
  @ApiOperation({ summary: 'Mas’ul tayinlash' })
  assign(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: V2AssignLeadDto,
  ) {
    return this.leads.assign(user, actor, parseId(id, 'Lid'), payload);
  }

  @Post(':id/assign')
  @HttpCode(200)
  @V2Permission('leads.update')
  @ApiOperation({ summary: 'Mas’ul tayinlash (POST)' })
  assignPost(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: V2AssignLeadDto,
  ) {
    return this.leads.assign(user, actor, parseId(id, 'Lid'), payload);
  }

  @Post(':id/convert')
  @HttpCode(200)
  @V2Permission('students.create')
  @ApiOperation({ summary: 'Lidni o‘quvchiga aylantirish' })
  convert(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: V2ConvertLeadDto,
  ) {
    return this.leads.convert(user, actor, parseId(id, 'Lid'), payload);
  }

  @Get(':id/activities')
  @V2Permission('leads.read')
  @ApiOperation({ summary: 'Lid faoliyati' })
  activities(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.leads.activities(user, actor, parseId(id, 'Lid'));
  }

  @Post(':id/activities')
  @V2Permission('leads.update')
  @ApiOperation({ summary: 'Faoliyat qo‘shish (izoh, qo‘ng‘iroq, vazifa)' })
  createActivity(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: V2CreateLeadActivityDto,
  ) {
    return this.leads.createActivity(user, actor, parseId(id, 'Lid'), payload);
  }

  @Patch(':id/activities/:aid')
  @V2Permission('leads.update')
  @ApiOperation({ summary: 'Faoliyatni tahrirlash' })
  updateActivity(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Param('aid') aid: string,
    @Body() payload: V2UpdateLeadActivityDto,
  ) {
    return this.leads.updateActivity(
      user,
      actor,
      parseId(id, 'Lid'),
      parseId(aid, 'Yozuv'),
      payload,
    );
  }

  @Delete(':id/activities/:aid')
  @HttpCode(204)
  @V2Permission('leads.update')
  @ApiOperation({ summary: 'Faoliyatni o‘chirish' })
  removeActivity(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Param('aid') aid: string,
  ) {
    return this.leads.removeActivity(
      user,
      actor,
      parseId(id, 'Lid'),
      parseId(aid, 'Yozuv'),
    );
  }
}

@V2Controller('lead-stages')
@ApiBearerAuth()
@UseGuards(V2AuthGuard)
@V2Roles(...LEAD_ROLES)
export class V2LeadStagesController {
  constructor(private readonly leads: V2LeadsService) {}

  @Get()
  @ApiOperation({ summary: 'Lid bosqichlari' })
  list(@CurrentUser() user: RequestUser) {
    return this.leads.stages(user);
  }

  @Put()
  @V2Roles(...STAGE_ADMINS)
  @V2Permission('lead_stages.update')
  @ApiOperation({ summary: 'Lid bosqichlarini sozlash' })
  update(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Body() payload: V2UpdateLeadStagesDto,
  ) {
    return this.leads.updateStages(user, actor, payload);
  }
}

@V2Controller('lead-sources')
@ApiBearerAuth()
@UseGuards(V2AuthGuard)
@V2Roles(...LEAD_ROLES)
export class V2LeadSourcesController {
  constructor(private readonly leads: V2LeadsService) {}

  @Get()
  @ApiOperation({ summary: 'Lid manbalari' })
  list(@CurrentUser() user: RequestUser) {
    return this.leads.sources(user);
  }

  @Post()
  @V2Roles(...STAGE_ADMINS)
  @V2Permission('lead_sources.create')
  @ApiOperation({ summary: 'Manba qo‘shish' })
  create(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Body() payload: V2CreateLeadSourceDto,
  ) {
    return this.leads.createSource(user, actor, payload);
  }

  @Delete(':id')
  @V2Roles(...STAGE_ADMINS)
  @V2Permission('lead_sources.delete')
  @ApiOperation({ summary: 'Manbani o‘chirish' })
  remove(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.leads.removeSource(user, actor, parseId(id, 'Manba'));
  }
}
