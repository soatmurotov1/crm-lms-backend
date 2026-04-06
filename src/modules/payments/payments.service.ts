import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { StartPaymentDto } from './dto/start-payment.dto';
import { MarkPaymentDto } from './dto/mark-payment.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService) {}

  private paymeMerchantId = process.env.PAYME_MERCHANT_ID || '';
  private paymeCheckoutUrl = process.env.PAYME_CHECKOUT_URL || '';
  private telegramToken = process.env.TELEGRAM_BOT_TOKEN || '';
  private telegramChatId = process.env.TELEGRAM_CHAT_ID || '';

  private formatTelegramTime(date = new Date()) {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  private toAmount(value: unknown) {
    if (value && typeof value === 'object' && 'toNumber' in value) {
      // @ts-ignore - Prisma Decimal provides toNumber at runtime
      return value.toNumber();
    }
    return Number(value || 0);
  }

  private buildPaymeUrl(
    paymentId: number,
    amount: number,
    studentId: number,
    groupId: number,
  ) {
    if (!this.paymeMerchantId || !this.paymeCheckoutUrl) {
      throw new BadRequestException('Payme sozlamalari topilmadi');
    }

    const amountInTiyin = Math.round(amount * 100);
    const payload = Buffer.from(
      `m=${this.paymeMerchantId};a=${amountInTiyin};ac.payment_id=${paymentId};ac.student_id=${studentId};ac.group_id=${groupId}`,
    ).toString('base64');

    return `${this.paymeCheckoutUrl}${payload}`;
  }

  private async notifyTelegram(text: string) {
    if (!this.telegramToken || !this.telegramChatId) return;

    const message = `${text}\nVaqt: ${this.formatTelegramTime()}`;

    try {
      await fetch(
        `https://api.telegram.org/bot${this.telegramToken}/sendMessage`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: this.telegramChatId,
            text: message,
          }),
        },
      );
    } catch {
      // Ignore bot errors and keep payment flow alive.
    }
  }

  private normalizeMonthYear(year?: number, month?: number) {
    const now = new Date();
    const targetYear = Number(year || now.getFullYear());
    const targetMonth = Number(month || now.getMonth() + 1);

    if (!Number.isFinite(targetYear) || !Number.isFinite(targetMonth)) {
      throw new BadRequestException("Noto'g'ri sana");
    }

    return { targetYear, targetMonth };
  }

  private getExpiresAt(createdAt?: Date | null) {
    if (!createdAt) return null;
    return new Date(createdAt.getTime() + 60 * 60 * 1000);
  }

  private minutesLeft(expiresAt?: Date | null) {
    if (!expiresAt) return null;
    const diff = expiresAt.getTime() - Date.now();
    return Math.max(Math.ceil(diff / 60000), 0);
  }

  async getMonthlySummary(year?: number, month?: number) {
    const { targetYear, targetMonth } = this.normalizeMonthYear(year, month);

    const studentGroups = await this.prisma.studentGroup.findMany({
      where: {
        status: 'ACTIVE',
        student: { status: 'ACTIVE' },
        group: { status: 'ACTIVE' },
      },
      include: {
        group: { include: { course: true } },
      },
    });

    const payments = await this.prisma.payment.findMany({
      where: {
        year: targetYear,
        month: targetMonth,
      },
    });

    const paymentMap = new Map(
      payments.map((payment) => [
        `${payment.studentId}:${payment.groupId}`,
        payment,
      ]),
    );

    let expected = 0;
    let paid = 0;
    let pending = 0;

    studentGroups.forEach((studentGroup) => {
      const amount = this.toAmount(studentGroup.group.course?.price);
      expected += amount;

      const payment = paymentMap.get(
        `${studentGroup.studentId}:${studentGroup.groupId}`,
      );

      if (!payment) return;

      const paymentAmount = this.toAmount(payment.amount);
      if (payment.status === PaymentStatus.PAID) {
        paid += paymentAmount;
      } else if (payment.status === PaymentStatus.PENDING) {
        pending += paymentAmount;
      }
    });

    return {
      year: targetYear,
      month: targetMonth,
      paid,
      pending,
      debt: Math.max(expected - paid - pending, 0),
      expected,
    };
  }

  async getAdminMonthlyPayments(
    year?: number,
    month?: number,
    status?: string,
  ) {
    const { targetYear, targetMonth } = this.normalizeMonthYear(year, month);

    const studentGroups = await this.prisma.studentGroup.findMany({
      where: {
        status: 'ACTIVE',
        student: { status: 'ACTIVE' },
        group: { status: 'ACTIVE' },
      },
      include: {
        student: true,
        group: { include: { course: true } },
      },
    });

    const payments = await this.prisma.payment.findMany({
      where: {
        year: targetYear,
        month: targetMonth,
      },
      include: {
        student: true,
        group: { include: { course: true } },
      },
    });

    const paymentMap = new Map(
      payments.map((payment) => [
        `${payment.studentId}:${payment.groupId}`,
        payment,
      ]),
    );

    const items = studentGroups.map((studentGroup) => {
      const payment = paymentMap.get(
        `${studentGroup.studentId}:${studentGroup.groupId}`,
      );
      const amount = this.toAmount(studentGroup.group.course?.price);
      const statusValue = payment?.status || 'DEBT';
      const expiresAt =
        statusValue === PaymentStatus.PENDING
          ? this.getExpiresAt(payment?.created_at || null)
          : null;

      return {
        paymentId: payment?.id || null,
        studentId: studentGroup.studentId,
        studentName: studentGroup.student.fullName,
        courseId: studentGroup.group.courseId,
        courseName: studentGroup.group.course?.name || '-',
        groupId: studentGroup.groupId,
        groupName: studentGroup.group.name || '-',
        amount,
        status: statusValue,
        createdAt: payment?.created_at || null,
        paidAt: payment?.paidAt || null,
        expiresAt,
        minutesLeft: this.minutesLeft(expiresAt),
      };
    });

    const filtered =
      status && status !== 'ALL'
        ? items.filter((item) => item.status === status)
        : items;

    return filtered.sort((a, b) => {
      const order = { PENDING: 1, DEBT: 2, PAID: 3, CANCELED: 4 };
      const orderA = order[a.status] || 9;
      const orderB = order[b.status] || 9;
      if (orderA !== orderB) return orderA - orderB;
      return String(a.studentName).localeCompare(String(b.studentName));
    });
  }

  async getStudentMonthlyPayments(
    studentId: number,
    year?: number,
    month?: number,
  ) {
    const { targetYear, targetMonth } = this.normalizeMonthYear(year, month);

    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
    });
    if (!student) {
      throw new NotFoundException('Talaba topilmadi');
    }

    const studentGroups = await this.prisma.studentGroup.findMany({
      where: {
        studentId,
        status: 'ACTIVE',
        group: { status: 'ACTIVE' },
      },
      include: {
        group: { include: { course: true } },
      },
    });

    const payments = await this.prisma.payment.findMany({
      where: {
        studentId,
        year: targetYear,
        month: targetMonth,
      },
    });

    const paymentMap = new Map(
      payments.map((payment) => [`${payment.groupId}`, payment]),
    );

    return studentGroups.map((studentGroup) => {
      const payment = paymentMap.get(String(studentGroup.groupId));
      const amount = this.toAmount(studentGroup.group.course?.price);

      return {
        groupId: studentGroup.groupId,
        groupName: studentGroup.group?.name || '-',
        courseId: studentGroup.group?.courseId,
        courseName: studentGroup.group?.course?.name || '-',
        amount,
        status: payment?.status || 'DEBT',
        paymentId: payment?.id || null,
        paidAt: payment?.paidAt || null,
        expiresAt:
          payment?.status === PaymentStatus.PENDING
            ? this.getExpiresAt(payment.created_at)
            : null,
      };
    });
  }

  async startStudentPayment(studentId: number, payload: StartPaymentDto) {
    const { groupId, year, month } = payload;

    const studentGroup = await this.prisma.studentGroup.findFirst({
      where: {
        studentId,
        groupId,
        status: 'ACTIVE',
        group: { status: 'ACTIVE' },
      },
      include: {
        student: true,
        group: { include: { course: true } },
      },
    });

    if (!studentGroup) {
      throw new NotFoundException('Talaba guruhda topilmadi');
    }

    const amount = this.toAmount(studentGroup.group.course?.price);
    if (!amount) {
      throw new BadRequestException('Kurs narxi topilmadi');
    }

    const existing = await this.prisma.payment.findFirst({
      where: {
        studentId,
        groupId,
        year,
        month,
      },
    });

    if (existing?.status === PaymentStatus.PAID) {
      throw new BadRequestException("Ushbu oy uchun to'lov qilingan");
    }

    const payment = existing
      ? await this.prisma.payment.update({
          where: { id: existing.id },
          data: {
            status: PaymentStatus.PENDING,
            method: PaymentMethod.PAYME,
            amount,
          },
        })
      : await this.prisma.payment.create({
          data: {
            studentId,
            groupId,
            courseId: studentGroup.group.courseId,
            amount,
            status: PaymentStatus.PENDING,
            method: PaymentMethod.PAYME,
            year,
            month,
          },
        });

    await this.notifyTelegram(
      `${studentGroup.student.fullName} ${studentGroup.group.course?.name || ''} kursi uchun ${amount} so'm to'lovni boshladi.`,
    );

    return {
      paymentId: payment.id,
      paymentUrl: this.buildPaymeUrl(payment.id, amount, studentId, groupId),
      amount,
      status: payment.status,
    };
  }

  async markPaymentPaid(paymentId: number, payload: MarkPaymentDto) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { student: true, group: { include: { course: true } } },
    });

    if (!payment) {
      throw new NotFoundException("To'lov topilmadi");
    }

    const updated = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.PAID,
        method: payload.method || payment.method || PaymentMethod.MANUAL,
        paidAt: new Date(),
      },
    });

    await this.notifyTelegram(
      `${payment.student.fullName} ${payment.group.course?.name || ''} kursi uchun to'lov tasdiqlandi.`,
    );

    return updated;
  }

  async updatePaymentStatus(
    paymentId: number,
    payload: UpdatePaymentStatusDto,
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { student: true, group: { include: { course: true } } },
    });

    if (!payment) {
      throw new NotFoundException("To'lov topilmadi");
    }

    const nextStatus = payload.status;

    const updated = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: nextStatus,
        paidAt: nextStatus === PaymentStatus.PAID ? new Date() : payment.paidAt,
      },
    });

    if (nextStatus === PaymentStatus.PAID) {
      await this.notifyTelegram(
        `${payment.student.fullName} ${payment.group.course?.name || ''} kursi uchun to'lov tasdiqlandi.`,
      );
    }

    if (nextStatus === PaymentStatus.CANCELED) {
      await this.notifyTelegram(
        `${payment.student.fullName} ${payment.group.course?.name || ''} kursi uchun to'lov bekor qilindi.`,
      );
    }

    if (nextStatus === PaymentStatus.PENDING) {
      await this.notifyTelegram(
        `${payment.student.fullName} ${payment.group.course?.name || ''} kursi uchun to'lov jarayoni qayta boshlandi.`,
      );
    }

    return updated;
  }

  @Cron('*/5 * * * *')
  async autoCancelExpiredPayments() {
    const threshold = new Date(Date.now() - 60 * 60 * 1000);
    const expired = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.PENDING,
        created_at: { lt: threshold },
      },
      include: {
        student: true,
        group: { include: { course: true } },
      },
    });

    if (!expired.length) return;

    await this.prisma.payment.updateMany({
      where: {
        id: { in: expired.map((payment) => payment.id) },
      },
      data: {
        status: PaymentStatus.CANCELED,
      },
    });

    for (const payment of expired) {
      await this.notifyTelegram(
        `${payment.student.fullName} ${payment.group.course?.name || ''} kursi uchun to'lov 1 soatda tasdiqlanmadi va bekor qilindi.`,
      );
    }
  }

  @Cron('0 * * * *')
  async sendHourlyStatus() {
    const endAt = new Date();
    const startAt = new Date(endAt.getTime() - 60 * 60 * 1000);

    const [paidLastHour, pendingLastHour] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          status: PaymentStatus.PAID,
          paidAt: {
            gte: startAt,
            lt: endAt,
          },
        },
      }),
      this.prisma.payment.findMany({
        where: {
          status: PaymentStatus.PENDING,
          created_at: {
            gte: startAt,
            lt: endAt,
          },
        },
      }),
    ]);

    const paidTotal = paidLastHour.reduce(
      (sum, payment) => sum + this.toAmount(payment.amount),
      0,
    );
    const pendingTotal = pendingLastHour.reduce(
      (sum, payment) => sum + this.toAmount(payment.amount),
      0,
    );

    await this.notifyTelegram(
      `Soatlik statistika (ohirgi 1 soat): to'langan ${paidLastHour.length} ta, jami ${paidTotal} so'm. Kutilayotgan ${pendingLastHour.length} ta, jami ${pendingTotal} so'm.`,
    );
  }

  @Cron('0 0 * * *')
  async sendDailyStats() {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const paidToday = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.PAID,
        paidAt: { gte: dayStart },
      },
    });

    const paidTotal = paidToday.reduce(
      (sum, payment) => sum + this.toAmount(payment.amount),
      0,
    );

    const summary = await this.getMonthlySummary(
      now.getFullYear(),
      now.getMonth() + 1,
    );

    await this.notifyTelegram(
      `Kunlik statistika: bugun to'langan ${paidToday.length} ta, jami ${paidTotal} so'm. Joriy oy: to'langan ${summary.paid} so'm, kutilmoqda ${summary.pending} so'm, qarz ${summary.debt} so'm.`,
    );
  }
}
