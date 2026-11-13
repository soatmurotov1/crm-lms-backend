import {
  Body,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
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
  V2CreateExpenseDto,
  V2CreateExpensePaymentDto,
  V2CreateTeacherSettlementDto,
  V2DeletedExpensesQueryDto,
  V2ExpenseLifecycleDto,
  V2ExpenseMonthCloseQueryDto,
  V2ExpenseTriageQueryDto,
  V2ExpensesQueryDto,
  V2UpdateExpenseDto,
} from './v2-expenses.dto';
import { V2ExpensesService } from './v2-expenses.service';

/** Xarajatlarni ko'radiganlar. */
const READERS = ['owner', 'accountant', 'manager'] as const;
/** Moliyaviy amallar (to'lov, bekor qilish, o'chirish). */
const FINANCE = ['owner', 'accountant'] as const;

@V2Controller('expenses')
@ApiBearerAuth()
@UseGuards(V2AuthGuard)
@V2Roles(...READERS)
export class V2ExpensesController {
  constructor(private readonly expenses: V2ExpensesService) {}

  @Get()
  @V2Permission('expenses.read')
  @ApiOperation({ summary: 'Xarajatlar ro‘yxati' })
  list(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Query() query: V2ExpensesQueryDto,
    @ActiveBranch() branchId: number | null,
  ) {
    return this.expenses.list(user, actor, query, branchId);
  }

  @Get('triage-counts')
  @V2Permission('expenses.read')
  @ApiOperation({ summary: 'Muddatlar bo‘yicha xarajatlar soni' })
  triage(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Query() query: V2ExpenseTriageQueryDto,
    @ActiveBranch() branchId: number | null,
  ) {
    return this.expenses.triageCounts(user, actor, query, branchId);
  }

  @Get('branch-options')
  @ApiOperation({ summary: 'Xarajat uchun filiallar' })
  branchOptions(@CurrentUser() user: RequestUser) {
    return this.expenses.branchOptions(user);
  }

  @Get('teacher-options')
  @V2Roles(...FINANCE)
  @ApiOperation({ summary: 'Hisob-kitob uchun o‘qituvchilar' })
  teacherOptions(@CurrentUser() user: RequestUser) {
    return this.expenses.teacherOptions(user);
  }

  @Get('history/deleted')
  @V2Permission('expenses.read')
  @ApiOperation({ summary: 'O‘chirilgan xarajatlar' })
  deleted(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Query() query: V2DeletedExpensesQueryDto,
  ) {
    return this.expenses.deletedHistory(user, actor, query);
  }

  @Get('month-close.csv')
  @V2Permission('expenses.read')
  @ApiOperation({ summary: 'Oy yopilishi (CSV)' })
  async monthClose(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Query() query: V2ExpenseMonthCloseQueryDto,
    @ActiveBranch() branchId: number | null,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { filename, body } = await this.expenses.monthCloseCsv(
      user,
      actor,
      query,
      branchId,
    );
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    return new StreamableFile(Buffer.from(body, 'utf-8'));
  }

  @Get(':id')
  @V2Permission('expenses.read')
  @ApiOperation({ summary: 'Xarajat' })
  detail(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.expenses.detail(user, actor, parseId(id, 'Xarajat'));
  }

  @Get(':id/history')
  @V2Permission('expenses.read')
  @ApiOperation({ summary: 'Xarajat tarixi va to‘lovlari' })
  history(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.expenses.history(user, actor, parseId(id, 'Xarajat'));
  }

  @Post()
  @V2Permission('expenses.create')
  @ApiOperation({ summary: 'Xarajat qo‘shish' })
  create(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Body() payload: V2CreateExpenseDto,
    @ActiveBranch() branchId: number | null,
  ) {
    return this.expenses.create(user, actor, payload, branchId);
  }

  @Patch(':id')
  @V2Permission('expenses.update')
  @ApiOperation({ summary: 'Xarajatni tahrirlash' })
  update(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: V2UpdateExpenseDto,
  ) {
    return this.expenses.update(user, actor, parseId(id, 'Xarajat'), payload);
  }

  @Patch(':id/cancel')
  @V2Roles(...FINANCE)
  @V2Permission('expenses.cancel')
  @ApiOperation({ summary: 'Xarajatni bekor qilish' })
  cancel(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: V2ExpenseLifecycleDto,
  ) {
    return this.expenses.cancel(user, actor, parseId(id, 'Xarajat'), payload);
  }

  @Delete(':id')
  @HttpCode(204)
  @V2Roles(...FINANCE)
  @V2Permission('expenses.delete')
  @ApiOperation({ summary: 'Xarajatni o‘chirish' })
  remove(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: V2ExpenseLifecycleDto,
  ) {
    return this.expenses.remove(user, actor, parseId(id, 'Xarajat'), payload);
  }

  @Post(':id/payments')
  @V2Roles(...FINANCE)
  @V2Permission('expenses.pay')
  @ApiOperation({ summary: 'Xarajat bo‘yicha to‘lov' })
  pay(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: V2CreateExpensePaymentDto,
  ) {
    return this.expenses.addPayment(
      user,
      actor,
      parseId(id, 'Xarajat'),
      payload,
    );
  }

  @Patch(':id/payments/:paymentId/void')
  @V2Roles(...FINANCE)
  @V2Permission('expense_payments.delete')
  @ApiOperation({ summary: 'To‘lovni bekor qilish' })
  voidPayment(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Body() payload: V2ExpenseLifecycleDto,
  ) {
    return this.expenses.voidPayment(
      user,
      actor,
      parseId(id, 'Xarajat'),
      parseId(paymentId, 'To‘lov'),
      payload,
    );
  }
}

@V2Controller('teacher-settlements')
@ApiBearerAuth()
@UseGuards(V2AuthGuard)
@V2Roles(...FINANCE)
export class V2TeacherSettlementsController {
  constructor(private readonly expenses: V2ExpensesService) {}

  @Post()
  @V2Permission('expenses.create')
  @ApiOperation({ summary: 'O‘qituvchi bilan hisob-kitob' })
  create(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Body() payload: V2CreateTeacherSettlementDto,
  ) {
    return this.expenses.createTeacherSettlement(user, actor, payload);
  }
}
