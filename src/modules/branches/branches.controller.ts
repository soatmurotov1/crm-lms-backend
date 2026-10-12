import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthGuard } from 'src/common/guard/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/roles.guard';
import { Roles } from 'src/common/guard/decarator.roles';
import {
  CurrentUser,
  type RequestUser,
} from 'src/common/guard/current-user.decorator';
import { BranchesService } from './branches.service';

@Controller('branches')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard)
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Roles(Role.SUPERADMIN, Role.ADMIN, Role.MANAGEMENT, Role.ADMINSTRATOR)
  @ApiOperation({ summary: 'Faol filiallar ro‘yxati' })
  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.branchesService.list(user);
  }
}
