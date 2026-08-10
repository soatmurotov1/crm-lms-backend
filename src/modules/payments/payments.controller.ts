import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { StartPaymentDto } from './dto/start-payment.dto';
import { MarkPaymentDto } from './dto/mark-payment.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';
import { AuthGuard } from 'src/common/guard/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/roles.guard';
import { Roles } from 'src/common/guard/decarator.roles';
import {
  CurrentUser,
  RequestUser,
} from 'src/common/guard/current-user.decorator';

@Controller('payments')
@ApiBearerAuth()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('summary/monthly')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.MANAGEMENT)
  getMonthlySummary(
    @CurrentUser() user: RequestUser,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.paymentsService.getMonthlySummary(
      user,
      year ? Number(year) : undefined,
      month ? Number(month) : undefined,
    );
  }

  @Get('summary/yearly')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.MANAGEMENT)
  getYearlySummary(
    @CurrentUser() user: RequestUser,
    @Query('year') year?: string,
  ) {
    return this.paymentsService.getYearlySummary(
      user,
      year ? Number(year) : undefined,
    );
  }

  @Get('admin/monthly')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.MANAGEMENT)
  getAdminMonthlyPayments(
    @CurrentUser() user: RequestUser,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('status') status?: string,
  ) {
    return this.paymentsService.getAdminMonthlyPayments(
      user,
      year ? Number(year) : undefined,
      month ? Number(month) : undefined,
      status,
    );
  }

  @Get('students/:studentId/monthly')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(
    Role.ADMIN,
    Role.SUPERADMIN,
    Role.MANAGEMENT,
    Role.TEACHER,
    Role.STUDENT,
  )
  getStudentMonthlyPayments(
    @Param('studentId', ParseIntPipe) studentId: number,
    @Req() req: Request,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.paymentsService.getStudentMonthlyPayments(
      studentId,
      req['user'],
      year ? Number(year) : undefined,
      month ? Number(month) : undefined,
    );
  }

  @Post('students/:studentId/start')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.MANAGEMENT)
  startStudentPayment(
    @Param('studentId', ParseIntPipe) studentId: number,
    @Body() payload: StartPaymentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.paymentsService.startStudentPayment(studentId, payload, user);
  }

  @Patch(':paymentId/mark-paid')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.MANAGEMENT)
  markPaymentPaid(
    @Param('paymentId', ParseIntPipe) paymentId: number,
    @Body() payload: MarkPaymentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.paymentsService.markPaymentPaid(paymentId, payload, user);
  }

  @Patch(':paymentId/status')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.MANAGEMENT)
  updatePaymentStatus(
    @Param('paymentId', ParseIntPipe) paymentId: number,
    @Body() payload: UpdatePaymentStatusDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.paymentsService.updatePaymentStatus(paymentId, payload, user);
  }
}
