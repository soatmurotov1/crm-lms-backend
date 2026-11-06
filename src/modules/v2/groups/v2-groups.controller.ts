import {
  Body,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
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
  V2CreateGroupDto,
  V2GroupsOverviewQueryDto,
  V2GroupsQueryDto,
  V2UpdateGroupDto,
} from './v2-groups.dto';
import { V2GroupsService } from './v2-groups.service';

const MANAGERS = ['dev', 'owner', 'manager'] as const;

@V2Controller('groups')
@ApiBearerAuth()
@UseGuards(V2AuthGuard)
export class V2GroupsController {
  constructor(private readonly groups: V2GroupsService) {}

  @Get()
  @V2Permission('groups.read')
  @ApiOperation({ summary: 'Guruhlar ro‘yxati' })
  list(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Query() query: V2GroupsQueryDto,
    @ActiveBranch() branchId: number | null,
  ) {
    return this.groups.list(user, actor, query, branchId);
  }

  @Get('overview')
  @V2Permission('groups.read')
  @ApiOperation({ summary: 'Filiallar bo‘yicha guruhlar' })
  overview(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Query() _query: V2GroupsOverviewQueryDto,
    @ActiveBranch() branchId: number | null,
  ) {
    return this.groups.overview(user, actor, branchId);
  }

  @Get(':id')
  @V2Permission('groups.read')
  @ApiOperation({ summary: 'Guruh kartochkasi (o‘quvchilar bilan)' })
  detail(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.groups.detail(user, actor, parseId(id, 'Guruh'));
  }

  @Post()
  @V2Roles(...MANAGERS)
  @V2Permission('groups.create')
  @ApiOperation({ summary: 'Guruh yaratish' })
  create(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Body() payload: V2CreateGroupDto,
    @ActiveBranch() branchId: number | null,
  ) {
    return this.groups.create(user, actor, payload, branchId);
  }

  @Patch(':id/restore')
  @HttpCode(204)
  @V2Roles('dev', 'owner')
  @V2Permission('groups.restore')
  @ApiOperation({ summary: 'O‘chirilgan guruhni tiklash' })
  restore(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.groups.restore(user, actor, parseId(id, 'Guruh'));
  }

  @Patch(':id')
  @V2Roles(...MANAGERS)
  @V2Permission('groups.update')
  @ApiOperation({ summary: 'Guruhni tahrirlash' })
  update(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: V2UpdateGroupDto,
  ) {
    return this.groups.update(user, actor, parseId(id, 'Guruh'), payload);
  }

  @Delete(':id')
  @HttpCode(204)
  @V2Roles(...MANAGERS)
  @V2Permission('groups.delete')
  @ApiOperation({ summary: 'Guruhni o‘chirish' })
  remove(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.groups.remove(user, actor, parseId(id, 'Guruh'));
  }
}
