import { Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  CurrentUser,
  type RequestUser,
} from 'src/common/guard/current-user.decorator';
import {
  ActiveBranch,
  CurrentActor,
  V2AuthGuard,
  V2Roles,
  type V2Actor,
} from '../common/v2-auth.guard';
import { V2Controller } from '../common/v2-controller.decorator';
import {
  V2AnalyticsQueryDto,
  V2CompanyOverviewQueryDto,
  V2FinanceQueryDto,
} from './dto/v2-dashboard-query.dto';
import { V2DashboardService } from './v2-dashboard.service';

/** Moliya bloki: egasi, menejer va buxgalter. */
const FINANCE = ['dev', 'owner', 'manager', 'accountant'] as const;

@V2Controller('dashboard')
@ApiBearerAuth()
@UseGuards(V2AuthGuard)
export class V2DashboardController {
  constructor(private readonly dashboardService: V2DashboardService) {}

  @Get('company-overview')
  @ApiOperation({
    summary: 'Bosh sahifa: tushum, qarz, o‘quvchilar, filiallar',
  })
  companyOverview(
    @CurrentUser() user: RequestUser,
    @Query() query: V2CompanyOverviewQueryDto,
    @ActiveBranch() branchId: number | null,
  ) {
    return this.dashboardService.companyOverview(user, query, branchId);
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Oylar kesimidagi analitika (eski bosh sahifa)' })
  analytics(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Query() query: V2AnalyticsQueryDto,
    @ActiveBranch() branchId: number | null,
  ) {
    return this.dashboardService.analytics(user, actor, query, branchId);
  }

  @Get('teacher-analytics')
  @V2Roles('teacher')
  @ApiOperation({ summary: 'O‘qituvchi: guruhlar va o‘quvchilar natijasi' })
  teacherAnalytics(@CurrentActor() actor: V2Actor) {
    return this.dashboardService.teacherAnalytics(actor);
  }

  @Get('finance-summary')
  @V2Roles(...FINANCE)
  @ApiOperation({ summary: 'Davr bo‘yicha tushum, xarajat va qoldiq' })
  financeSummary(
    @CurrentUser() user: RequestUser,
    @Query() query: V2FinanceQueryDto,
    @ActiveBranch() branchId: number | null,
  ) {
    return this.dashboardService.financeSummary(user, query, branchId);
  }

  @Get('expense-breakdown')
  @V2Roles(...FINANCE)
  @ApiOperation({ summary: 'Xarajatlar tur va filial bo‘yicha' })
  expenseBreakdown(
    @CurrentUser() user: RequestUser,
    @Query() query: V2FinanceQueryDto,
    @ActiveBranch() branchId: number | null,
  ) {
    return this.dashboardService.expenseBreakdown(user, query, branchId);
  }
}
