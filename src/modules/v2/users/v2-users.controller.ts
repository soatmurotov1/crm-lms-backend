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
import { V2OptionsService } from './v2-options.service';
import {
  V2CreateUserDto,
  V2PermissionTemplateDto,
  V2UpdateAccessDto,
  V2UpdateUserDto,
  V2UsersQueryDto,
  V2WriteOptionsQueryDto,
} from './v2-users.dto';
import { V2UsersService } from './v2-users.service';

const STAFF_MANAGERS = ['dev', 'owner', 'manager'] as const;

@V2Controller('users')
@ApiBearerAuth()
@UseGuards(V2AuthGuard)
export class V2UsersController {
  constructor(private readonly users: V2UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Xodimlar (rol bo‘yicha: teacher, operator, ...)' })
  list(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Query() query: V2UsersQueryDto,
    @ActiveBranch() branchId: number | null,
  ) {
    return this.users.list(user, actor, query, branchId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xodim kartochkasi' })
  detail(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.users.detail(user, id);
  }

  @Post()
  @V2Roles(...STAFF_MANAGERS)
  @V2Permission('staff.create')
  @ApiOperation({ summary: 'Xodim qo‘shish' })
  create(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Body() payload: V2CreateUserDto,
    @ActiveBranch() branchId: number | null,
  ) {
    return this.users.create(user, actor, payload, branchId);
  }

  @Get(':id/access')
  @V2Roles(...STAFF_MANAGERS)
  @ApiOperation({ summary: 'Xodim ruxsatlari' })
  access(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.users.access(user, id);
  }

  @Patch(':id/access')
  @V2Roles(...STAFF_MANAGERS)
  @V2Permission('staff.update')
  @ApiOperation({ summary: 'Xodim ruxsatlarini o‘zgartirish' })
  updateAccess(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: V2UpdateAccessDto,
  ) {
    return this.users.updateAccess(user, actor, id, payload, false);
  }

  @Patch(':id/delegation')
  @V2Roles('dev', 'owner')
  @ApiOperation({ summary: 'Xodimga ruxsat berish huquqini topshirish' })
  updateDelegation(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: V2UpdateAccessDto,
  ) {
    return this.users.updateAccess(user, actor, id, payload, true);
  }

  @Patch(':id/activate')
  @HttpCode(204)
  @V2Roles(...STAFF_MANAGERS)
  @V2Permission('staff.update')
  @ApiOperation({ summary: 'Xodimni faollashtirish' })
  activate(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.users.setActive(user, actor, id, true);
  }

  @Patch(':id/deactivate')
  @HttpCode(204)
  @V2Roles(...STAFF_MANAGERS)
  @V2Permission('staff.update')
  @ApiOperation({ summary: 'Xodimni nofaol qilish (sessiyalari yopiladi)' })
  deactivate(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.users.setActive(user, actor, id, false);
  }

  @Patch(':id/restore')
  @HttpCode(204)
  @V2Roles('dev', 'owner')
  @V2Permission('staff.restore')
  @ApiOperation({ summary: 'O‘chirilgan xodimni tiklash' })
  restore(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.users.restore(user, actor, id);
  }

  @Patch(':id')
  @V2Roles(...STAFF_MANAGERS)
  @V2Permission('staff.update')
  @ApiOperation({ summary: 'Xodimni tahrirlash' })
  update(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: V2UpdateUserDto,
  ) {
    return this.users.update(user, actor, id, payload);
  }

  @Delete(':id')
  @HttpCode(204)
  @V2Roles(...STAFF_MANAGERS)
  @V2Permission('staff.delete')
  @ApiOperation({ summary: 'Xodimni o‘chirish' })
  remove(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.users.remove(user, actor, id);
  }
}

@V2Controller('permissions')
@ApiBearerAuth()
@UseGuards(V2AuthGuard)
export class V2PermissionsController {
  constructor(
    private readonly users: V2UsersService,
    private readonly options: V2OptionsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Ruxsatlar katalogi, shablonlar va filiallar' })
  catalogue(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
  ) {
    return this.users.catalogue(user, actor);
  }

  @Get('options')
  @ApiOperation({ summary: 'Yozish formalari uchun tanlovlar' })
  writeOptions(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Query() query: V2WriteOptionsQueryDto,
  ) {
    return this.options.options(user, actor, query);
  }

  @Post('templates')
  @V2Roles('dev', 'owner')
  @ApiOperation({ summary: 'Ruxsatlar shablonini yaratish' })
  createTemplate(
    @CurrentActor() actor: V2Actor,
    @Body() payload: V2PermissionTemplateDto,
  ) {
    return this.users.createTemplate(actor, payload);
  }

  @Patch('templates/:id')
  @V2Roles('dev', 'owner')
  @ApiOperation({ summary: 'Ruxsatlar shablonini tahrirlash' })
  updateTemplate(
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: V2PermissionTemplateDto,
  ) {
    return this.users.updateTemplate(actor, parseId(id, 'Shablon'), payload);
  }

  @Delete('templates/:id')
  @HttpCode(204)
  @V2Roles('dev', 'owner')
  @ApiOperation({ summary: 'Ruxsatlar shablonini o‘chirish' })
  deleteTemplate(@CurrentActor() actor: V2Actor, @Param('id') id: string) {
    return this.users.deleteTemplate(actor, parseId(id, 'Shablon'));
  }
}
