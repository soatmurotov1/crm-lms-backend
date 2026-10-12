import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthGuard } from 'src/common/guard/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/roles.guard';
import { Roles } from 'src/common/guard/decarator.roles';
import {
  CurrentUser,
  type RequestUser,
} from 'src/common/guard/current-user.decorator';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

@Controller('dashboard')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Roles(Role.SUPERADMIN, Role.ADMIN, Role.MANAGEMENT, Role.ADMINSTRATOR)
  @ApiOperation({ summary: 'Bosh sahifa ko‘rsatkichlari' })
  @Get('summary')
  getSummary(
    @CurrentUser() user: RequestUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.dashboardService.getSummary(user, query);
  }
}
