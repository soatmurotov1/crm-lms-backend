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
  V2CreatePaymentDto,
  V2PaymentSnapshotQueryDto,
  V2PaymentsQueryDto,
  V2UpdatePaymentDto,
} from './v2-payments.dto';
import { V2PaymentsService } from './v2-payments.service';

const OPS = ['dev', 'owner', 'manager', 'operator'] as const;
const READERS = [...OPS, 'accountant'] as const;

@V2Controller('payments')
@ApiBearerAuth()
@UseGuards(V2AuthGuard)
export class V2PaymentsController {
  constructor(private readonly payments: V2PaymentsService) {}

  @Get()
  @V2Roles(...READERS)
  @V2Permission('payments.read')
  @ApiOperation({ summary: 'To‘lovlar ro‘yxati' })
  list(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Query() query: V2PaymentsQueryDto,
    @ActiveBranch() branchId: number | null,
  ) {
    return this.payments.list(user, actor, query, branchId);
  }

  @Get('snapshot')
  @V2Roles(...READERS)
  @V2Permission('payments.read')
  @ApiOperation({ summary: 'Bugungi/oylik tushum va umumiy qarz' })
  snapshot(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Query() query: V2PaymentSnapshotQueryDto,
    @ActiveBranch() branchId: number | null,
  ) {
    return this.payments.snapshot(user, actor, query, branchId);
  }

  @Get('summary')
  @V2Roles(...READERS)
  @V2Permission('payments.read')
  @ApiOperation({ summary: 'Filtrlangan to‘lovlar yig‘indisi' })
  summary(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Query() query: V2PaymentsQueryDto,
    @ActiveBranch() branchId: number | null,
  ) {
    return this.payments.summary(user, actor, query, branchId);
  }

  @Post()
  @V2Roles(...OPS)
  @V2Permission('payments.create')
  @ApiOperation({ summary: 'To‘lov qabul qilish' })
  create(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Body() payload: V2CreatePaymentDto,
  ) {
    return this.payments.create(user, actor, payload);
  }

  @Patch(':id')
  @V2Roles(...OPS)
  @V2Permission('payments.update')
  @ApiOperation({ summary: 'To‘lovni tahrirlash' })
  update(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: V2UpdatePaymentDto,
  ) {
    return this.payments.update(user, actor, parseId(id, 'To‘lov'), payload);
  }

  @Delete(':id')
  @HttpCode(204)
  @V2Roles('dev', 'owner', 'manager')
  @V2Permission('payments.delete')
  @ApiOperation({ summary: 'To‘lovni o‘chirish' })
  remove(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.payments.remove(user, actor, parseId(id, 'To‘lov'));
  }
}
