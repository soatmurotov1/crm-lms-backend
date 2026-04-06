import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { StartPaymentDto } from './dto/start-payment.dto';
import { MarkPaymentDto } from './dto/mark-payment.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('summary/monthly')
  getMonthlySummary(
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.paymentsService.getMonthlySummary(
      year ? Number(year) : undefined,
      month ? Number(month) : undefined,
    );
  }

  @Get('admin/monthly')
  getAdminMonthlyPayments(
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('status') status?: string,
  ) {
    return this.paymentsService.getAdminMonthlyPayments(
      year ? Number(year) : undefined,
      month ? Number(month) : undefined,
      status,
    );
  }

  @Get('students/:studentId/monthly')
  getStudentMonthlyPayments(
    @Param('studentId', ParseIntPipe) studentId: number,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.paymentsService.getStudentMonthlyPayments(
      studentId,
      year ? Number(year) : undefined,
      month ? Number(month) : undefined,
    );
  }

  @Post('students/:studentId/start')
  startStudentPayment(
    @Param('studentId', ParseIntPipe) studentId: number,
    @Body() payload: StartPaymentDto,
  ) {
    return this.paymentsService.startStudentPayment(studentId, payload);
  }

  @Patch(':paymentId/mark-paid')
  markPaymentPaid(
    @Param('paymentId', ParseIntPipe) paymentId: number,
    @Body() payload: MarkPaymentDto,
  ) {
    return this.paymentsService.markPaymentPaid(paymentId, payload);
  }

  @Patch(':paymentId/status')
  updatePaymentStatus(
    @Param('paymentId', ParseIntPipe) paymentId: number,
    @Body() payload: UpdatePaymentStatusDto,
  ) {
    return this.paymentsService.updatePaymentStatus(paymentId, payload);
  }
}
