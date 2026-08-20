import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import { orgFilter } from 'src/common/utils/org-scope.util';
import { OrgAccessService } from 'src/common/utils/org-access.service';
import { Cron } from '@nestjs/schedule';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { StartPaymentDto } from './dto/start-payment.dto';
import { MarkPaymentDto } from './dto/mark-payment.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';
import { PaymeState } from './payme/payme.types';

/**
 * Prisma `Decimal` ni `instanceof` bilan tekshirmaymiz: adapter almashganda
 * (masalan `@prisma/adapter-pg`) qiymat boshqa Decimal implementatsiyasidan
 * kelishi mumkin, lekin `toNumber()` shartnomasi bir xil qoladi.
 */
type DecimalLike = { toNumber: () => number };

function isDecimalLike(value: unknown): value is DecimalLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'toNumber' in value &&
    typeof (value as DecimalLike).toNumber === 'function'
  );
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private orgAccess: OrgAccessService,
  ) {}

  /**
   * To'lov so'rov egasining tashkilotidami.
   *
   * To'lov guruhga bog'langan, tashkilot esa guruh orqali aniqlanadi.
   * Bu yerda faqat tashkilot tekshiriladi (o'qituvchi egaligi emas): to'lov
   * xodimlarning ishi va u guruh biriktirilishiga bog'liq emas.
   */
  private async assertPaymentInOrg(user: RequestUser, paymentId: number) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        groupId: true,
        status: true,
        method: true,
        paidAt: true,
      },
    });

    if (!payment) {
      throw new NotFoundException("To'lov topilmadi");
    }

    await this.orgAccess.assertGroupInOrg(user, payment.groupId);

    return payment;
  }

  private paymeMerchantId = process.env.PAYME_MERCHANT_ID || '';
  private paymeCheckoutUrl = process.env.PAYME_CHECKOUT_URL || '';

  /**
   * Prisma `Decimal` ni oddiy songa aylantiradi.
   *
   * Ilgari bu yerda `@ts-ignore` turardi va funksiya "error" tipini
   * qaytarardi. TypeScript uchun bu "tekshirishni to'xtat" degani: shu
   * funksiya natijasidan keyingi butun pul arifmetikasi — kutilgan summa,
   * to'langan, qarz, Payme uchun tiyinga o'tkazish — tipsiz qolgan edi.
   * Endi qaytish tipi aniq `number`.
   */
  private toAmount(value: unknown): number {
    if (isDecimalLike(value)) {
      return value.toNumber();
    }

    return Number(value ?? 0);
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

  async getMonthlySummary(user: RequestUser, year?: number, month?: number) {
    const { targetYear, targetMonth } = this.normalizeMonthYear(year, month);
    // To'lovlar guruh orqali tashkilotga tegishli.
    const groupOrg = orgFilter(user);

    const studentGroups = await this.prisma.studentGroup.findMany({
      where: {
        status: 'ACTIVE',
        student: { status: 'ACTIVE' },
        group: { status: 'ACTIVE', ...groupOrg },
      },
      include: {
        group: { include: { course: true } },
      },
    });

    const payments = await this.prisma.payment.findMany({
      where: {
        year: targetYear,
        month: targetMonth,
        group: groupOrg,
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

  /**
   * Yil bo'yicha oylik daromad — dashboard'dagi "Daromad statistikasi" grafigi uchun.
   * getMonthlySummary'ni 12 marta chaqirmaslik uchun ma'lumot bir marta olinib,
   * oylar bo'yicha xotirada guruhlanadi.
   */
  async getYearlySummary(user: RequestUser, year?: number) {
    const targetYear = Number(year || new Date().getFullYear());

    if (!Number.isFinite(targetYear)) {
      throw new BadRequestException("Noto'g'ri sana");
    }

    const groupOrg = orgFilter(user);

    const [studentGroups, payments] = await Promise.all([
      this.prisma.studentGroup.findMany({
        where: {
          status: 'ACTIVE',
          student: { status: 'ACTIVE' },
          group: { status: 'ACTIVE', ...groupOrg },
        },
        include: {
          group: { include: { course: true } },
        },
      }),
      this.prisma.payment.findMany({
        where: { year: targetYear, group: groupOrg },
      }),
    ]);

    const expectedPerMonth = studentGroups.reduce(
      (total, studentGroup) =>
        total + this.toAmount(studentGroup.group.course?.price),
      0,
    );

    const months = Array.from({ length: 12 }, (_, index) => ({
      year: targetYear,
      month: index + 1,
      paid: 0,
      pending: 0,
      debt: 0,
      expected: expectedPerMonth,
    }));

    payments.forEach((payment) => {
      const bucket = months[payment.month - 1];
      if (!bucket) return;

      const amount = this.toAmount(payment.amount);
      if (payment.status === PaymentStatus.PAID) {
        bucket.paid += amount;
      } else if (payment.status === PaymentStatus.PENDING) {
        bucket.pending += amount;
      }
    });

    months.forEach((bucket) => {
      bucket.debt = Math.max(bucket.expected - bucket.paid - bucket.pending, 0);
    });

    return { year: targetYear, months };
  }

  async getAdminMonthlyPayments(
    user: RequestUser,
    year?: number,
    month?: number,
    status?: string,
  ) {
    const { targetYear, targetMonth } = this.normalizeMonthYear(year, month);
    const groupOrg = orgFilter(user);

    const studentGroups = await this.prisma.studentGroup.findMany({
      where: {
        status: 'ACTIVE',
        student: { status: 'ACTIVE' },
        group: { status: 'ACTIVE', ...groupOrg },
      },
      include: {
        student: { select: { id: true, fullName: true, phone: true } },
        group: { include: { course: true } },
      },
    });

    const payments = await this.prisma.payment.findMany({
      where: {
        year: targetYear,
        month: targetMonth,
        group: groupOrg,
      },
      include: {
        student: { select: { id: true, fullName: true, phone: true } },
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
      // `status` string bo'lgani uchun xarita ochiq indekslanadigan qilib
      // e'lon qilinadi — aks holda noma'lum kalit "error" tip beradi.
      const order: Record<string, number> = {
        PENDING: 1,
        DEBT: 2,
        PAID: 3,
        CANCELED: 4,
      };
      const orderA = order[a.status] || 9;
      const orderB = order[b.status] || 9;
      if (orderA !== orderB) return orderA - orderB;
      return String(a.studentName).localeCompare(String(b.studentName));
    });
  }

  async getStudentMonthlyPayments(
    studentId: number,
    currentUser: RequestUser,
    year?: number,
    month?: number,
  ) {
    /*
      O'quvchining o'zi faqat o'zinikini ko'radi; o'qituvchi esa faqat o'z
      guruhidagilarni. Ilgari ikkinchi shart yo'q edi — markazdagi har qanday
      o'qituvchi istalgan o'quvchining to'lov tarixini ochib ko'ra olardi.
    */
    await this.orgAccess.assertStudentAccess(currentUser, studentId);

    const { targetYear, targetMonth } = this.normalizeMonthYear(year, month);

    // O'quvchi ham so'rov egasining tashkilotida bo'lishi shart.
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, ...orgFilter(currentUser) },
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

  async startStudentPayment(
    studentId: number,
    payload: StartPaymentDto,
    user: RequestUser,
  ) {
    const { groupId, year, month } = payload;

    /*
      Guruh so'rov egasining tashkilotidami. Busiz boshqa markazning
      o'quvchisi uchun to'lov yozuvi ochib, unga Payme havolasi yasash
      mumkin edi.
    */
    await this.orgAccess.assertGroupInOrg(user, groupId);

    const studentGroup = await this.prisma.studentGroup.findFirst({
      where: {
        studentId,
        groupId,
        status: 'ACTIVE',
        group: { status: 'ACTIVE' },
      },
      include: {
        student: { select: { id: true, fullName: true, phone: true } },
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

    return {
      paymentId: payment.id,
      paymentUrl: this.buildPaymeUrl(payment.id, amount, studentId, groupId),
      amount,
      status: payment.status,
    };
  }

  async markPaymentPaid(
    paymentId: number,
    payload: MarkPaymentDto,
    user: RequestUser,
  ) {
    /*
      Ilgari bu metod so'rov egasini umuman bilmasdi: rol tekshiruvidan
      o'tgan har qanday admin begona `paymentId` yuborib, boshqa markazning
      to'lovini "to'langan" qilib qo'yishi mumkin edi.
    */
    const payment = await this.assertPaymentInOrg(user, paymentId);

    // Idempotentlik: tugma ikki marta bosilsa yoki so'rov takrorlansa
    // `paidAt` qayta yozilmasin - aks holda to'lov sanasi surilib ketadi.
    if (payment.status === PaymentStatus.PAID) {
      return this.prisma.payment.findUnique({ where: { id: paymentId } });
    }

    const updated = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.PAID,
        method: payload.method || payment.method || PaymentMethod.MANUAL,
        paidAt: new Date(),
      },
    });

    return updated;
  }

  async updatePaymentStatus(
    paymentId: number,
    payload: UpdatePaymentStatusDto,
    user: RequestUser,
  ) {
    const payment = await this.assertPaymentInOrg(user, paymentId);

    const nextStatus = payload.status;

    const updated = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: nextStatus,
        paidAt: nextStatus === PaymentStatus.PAID ? new Date() : payment.paidAt,
      },
    });

    return updated;
  }

  /**
   * Boshlangan-u tugallanmagan to'lovlarni tozalaydi.
   *
   * MUHIM: Payme tranzaksiyasi ochilgan yoki bajarilgan to'lovga TEGILMAYDI.
   * Ilgari bu cron hamma `PENDING` to'lovni bir soatdan keyin bekor qilardi -
   * Payme esa tranzaksiyani 12 soatgacha tasdiqlashi mumkin. Natijada
   * haqiqatan to'langan pul ham "bekor qilingan" bo'lib qolardi.
   * Muddati o'tgan Payme tranzaksiyalarini `PaymeService` o'zi yopadi.
   */
  @Cron('*/5 * * * *')
  async autoCancelExpiredPayments() {
    const threshold = new Date(Date.now() - 60 * 60 * 1000);

    const { count } = await this.prisma.payment.updateMany({
      where: {
        status: PaymentStatus.PENDING,
        created_at: { lt: threshold },
        paymeTransactions: {
          none: {
            state: { in: [PaymeState.CREATED, PaymeState.PERFORMED] },
          },
        },
      },
      data: {
        status: PaymentStatus.CANCELED,
      },
    });

    if (count > 0) {
      this.logger.log(`${count} ta tugallanmagan to'lov bekor qilindi`);
    }
  }
}
