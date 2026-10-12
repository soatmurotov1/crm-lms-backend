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
import { ExpensesService } from './expenses.service';
import {
  CreateExpenseDto,
  UpdateExpenseDto,
} from './dto/create-expense.dto';
import { ExpenseQueryDto } from './dto/expense-query.dto';

@Controller('expenses')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPERADMIN)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @ApiOperation({ summary: `${Role.ADMIN}, ${Role.SUPERADMIN}` })
  @Get('all')
  getAll(@CurrentUser() user: RequestUser, @Query() query: ExpenseQueryDto) {
    return this.expensesService.getAll(user, query);
  }

  @ApiOperation({ summary: `${Role.ADMIN}, ${Role.SUPERADMIN}` })
  @Get('summary')
  getSummary(@CurrentUser() user: RequestUser) {
    return this.expensesService.getSummary(user);
  }

  @ApiOperation({ summary: `${Role.ADMIN}, ${Role.SUPERADMIN}` })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() payload: CreateExpenseDto) {
    return this.expensesService.create(user, payload);
  }

  @ApiOperation({ summary: `${Role.ADMIN}, ${Role.SUPERADMIN}` })
  @Put(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() payload: UpdateExpenseDto,
  ) {
    return this.expensesService.update(user, id, payload);
  }

  @ApiOperation({ summary: `${Role.ADMIN}, ${Role.SUPERADMIN}` })
  @Patch(':id/pay')
  markPaid(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.expensesService.markPaid(user, id);
  }

  @ApiOperation({ summary: `${Role.ADMIN}, ${Role.SUPERADMIN}` })
  @Patch(':id/restore')
  restore(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.expensesService.restore(user, id);
  }

  @ApiOperation({ summary: `${Role.ADMIN}, ${Role.SUPERADMIN}` })
  @Delete(':id')
  remove(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.expensesService.remove(user, id);
  }
}
