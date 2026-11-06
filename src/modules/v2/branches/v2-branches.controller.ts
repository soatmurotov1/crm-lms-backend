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
import { V2AuthGuard, V2Roles } from '../common/v2-auth.guard';
import { V2Controller } from '../common/v2-controller.decorator';
import { parseId } from '../common/v2.mapper';
import {
  V2BranchesQueryDto,
  V2CreateBranchDto,
  V2UpdateBranchDto,
} from './dto/v2-branch.dto';
import { V2BranchesService } from './v2-branches.service';

/** Filialni yaratish, o'zgartirish va o'chirish — faqat egasi. */
const OWNERS = ['dev', 'owner'] as const;

@V2Controller('branches')
@ApiBearerAuth()
@UseGuards(V2AuthGuard)
export class V2BranchesController {
  constructor(private readonly branchesService: V2BranchesService) {}

  @Get()
  @ApiOperation({ summary: 'Filiallar ro‘yxati' })
  list(@CurrentUser() user: RequestUser, @Query() query: V2BranchesQueryDto) {
    return this.branchesService.list(user, query.include_deleted);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Filial kartochkasi: tushum, qarz, qarzdorlar' })
  detail(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.branchesService.detail(user, parseId(id, 'Filial'));
  }

  @Post()
  @V2Roles(...OWNERS)
  @ApiOperation({ summary: 'Filial yaratish' })
  create(@CurrentUser() user: RequestUser, @Body() payload: V2CreateBranchDto) {
    return this.branchesService.create(user, payload);
  }

  @Patch(':id/restore')
  @HttpCode(204)
  @V2Roles(...OWNERS)
  @ApiOperation({ summary: 'O‘chirilgan filialni tiklash' })
  restore(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.branchesService.restore(user, parseId(id, 'Filial'));
  }

  @Patch(':id')
  @V2Roles(...OWNERS)
  @ApiOperation({ summary: 'Filialni tahrirlash' })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() payload: V2UpdateBranchDto,
  ) {
    return this.branchesService.update(user, parseId(id, 'Filial'), payload);
  }

  @Delete(':id')
  @HttpCode(204)
  @V2Roles(...OWNERS)
  @ApiOperation({ summary: 'Filialni o‘chirish (nofaol qilish)' })
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.branchesService.remove(user, parseId(id, 'Filial'));
  }
}
