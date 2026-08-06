import { Injectable, Logger } from '@nestjs/common';
import { PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import {
  PAYME_REASON_TIMEOUT,
  PAYME_TRANSACTION_TIMEOUT_MS,
  PaymeAccount,
  PaymeError,
  PaymeErrorCode,
  PaymeState,
  paymeMessage,
} from './payme.types';

/**
 * Payme Merchant API metodlarining amalga oshirilishi.
 *
 * Muhim: bu yerdagi hech bir metod HTTP xatosi tashlamaydi. Payme protokoli
 * bo'yicha hamma javob HTTP 200 bo'lishi shart, xato esa `PaymeError` orqali
 * controller'ga chiqadi va u yerda JSON-RPC `error` obyektiga aylanadi.
 */
@Injectable()
export class PaymeService {
  private readonly logger = new Logger(PaymeService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- utils

  /** Prisma `Decimal` ni oddiy songa aylantiradi. */
  private toNumber(value: Prisma.Decimal | number | null | undefined): number {
    if (value === null || value === undefined) return 0;
    return typeof value === 'number' ? value : value.toNumber();
  }

  /** To'lov summasi so'mda saqlanadi, Payme esa tiyinda yuboradi. */
  private toTiyin(amountInSom: Prisma.Decimal | number): number {
    return Math.round(this.toNumber(amountInSom) * 100);
  }

  /**
   * Payme `params.account` ichida `buildPaymeUrl` qo'ygan `ac.payment_id` ni
   * qaytaradi. Bu qiymat matn ko'rinishida kelishi mumkin.
   */
  private extractPaymentId(params: Record<string, unknown>): number {
    const account = (params?.account ?? {}) as PaymeAccount;
    const raw = account.payment_id;
    const paymentId = Number(raw);

    if (!raw || !Number.isInteger(paymentId) || paymentId <= 0) {
      throw new PaymeError(
        PaymeErrorCode.ACCOUNT_NOT_FOUND,
        paymeMessage(
          "To'lov raqami noto'g'ri",
          'Неверный номер платежа',
          'Invalid payment id',
        ),
        'payment_id',
      );
    }

    return paymentId;
  }

  /**
   * To'lovni topadi va uni Payme orqali to'lash mumkinligini tekshiradi.
   * `CheckPerformTransaction` va `CreateTransaction` ikkalasi ham shu
   * tekshiruvdan o'tadi - qoidalar bir joyda tursin.
   */
  private async resolvePayableOrder(params: Record<string, unknown>) {
    const paymentId = this.extractPaymentId(params);

    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new PaymeError(
        PaymeErrorCode.ACCOUNT_NOT_FOUND,
        paymeMessage(
          "Bunday to'lov topilmadi",
          'Платеж не найден',
          'Payment not found',
        ),
        'payment_id',
      );
    }

    if (payment.status === PaymentStatus.PAID) {
      throw new PaymeError(
        PaymeErrorCode.UNABLE_TO_PERFORM,
        paymeMessage(
          "Bu to'lov allaqachon amalga oshirilgan",
          'Платеж уже оплачен',
          'Payment is already paid',
        ),
      );
    }

    const expected = this.toTiyin(payment.amount);
    const received = Number(params?.amount);

    if (!Number.isFinite(received) || received !== expected) {
      throw new PaymeError(
        PaymeErrorCode.INVALID_AMOUNT,
        paymeMessage(
          "To'lov summasi mos kelmadi",
          'Неверная сумма',
          'Invalid amount',
        ),
      );
    }

    return payment;
  }

  /** Payme `time` ni millisekundda yuboradi; kelmasa hozirgi vaqtni olamiz. */
  private readTime(value: unknown): bigint {
    const time = Number(value);
    return BigInt(Number.isFinite(time) && time > 0 ? time : Date.now());
  }

  private isExpired(createTime: bigint): boolean {
    return Date.now() - Number(createTime) > PAYME_TRANSACTION_TIMEOUT_MS;
  }

  // ------------------------------------------------------- CheckPerform

  /**
   * Payme to'lov oynasini ochishdan oldin "bu buyurtmani to'lasa bo'ladimi"
   * deb so'raydi. Bu yerda hech nima yozilmaydi - faqat tekshiruv.
   */
  async checkPerformTransaction(params: Record<string, unknown>) {
    const payment = await this.resolvePayableOrder(params);

    // Bitta to'lov uchun bir vaqtda faqat bitta ochiq tranzaksiya bo'lsin.
    const openTransaction = await this.prisma.paymeTransaction.findFirst({
      where: { paymentId: payment.id, state: PaymeState.CREATED },
    });

    if (openTransaction && !this.isExpired(openTransaction.createTime)) {
      throw new PaymeError(
        PaymeErrorCode.UNABLE_TO_PERFORM,
        paymeMessage(
          "Bu to'lov uchun tugallanmagan tranzaksiya mavjud",
          'По этому платежу уже есть незавершенная транзакция',
          'There is a pending transaction for this payment',
        ),
      );
    }

    return { allow: true };
  }

  // ---------------------------------------------------- CreateTransaction

  async createTransaction(params: Record<string, unknown>) {
    const paycomId = String(params?.id ?? '');

    if (!paycomId) {
      throw new PaymeError(
        PaymeErrorCode.TRANSACTION_NOT_FOUND,
        paymeMessage(
          'Tranzaksiya raqami yuborilmadi',
          'Не указан идентификатор транзакции',
          'Transaction id is missing',
        ),
      );
    }

    // Takroriy so'rov: Payme tarmoq uzilganda o'sha so'rovni qayta yuboradi.
    // Shunda yangi yozuv yaratmasdan mavjudini qaytaramiz (idempotentlik).
    const existing = await this.prisma.paymeTransaction.findUnique({
      where: { paycomId },
    });

    if (existing) {
      if (existing.state !== PaymeState.CREATED) {
        throw new PaymeError(
          PaymeErrorCode.UNABLE_TO_PERFORM,
          paymeMessage(
            'Tranzaksiya holati mos emas',
            'Неверное состояние транзакции',
            'Invalid transaction state',
          ),
        );
      }

      if (this.isExpired(existing.createTime)) {
        await this.cancelExpired(existing.id);

        throw new PaymeError(
          PaymeErrorCode.UNABLE_TO_PERFORM,
          paymeMessage(
            'Tranzaksiya muddati tugagan',
            'Срок транзакции истек',
            'Transaction is expired',
          ),
        );
      }

      return {
        create_time: Number(existing.createTime),
        transaction: String(existing.id),
        state: existing.state,
      };
    }

    const payment = await this.resolvePayableOrder(params);

    const openTransaction = await this.prisma.paymeTransaction.findFirst({
      where: { paymentId: payment.id, state: PaymeState.CREATED },
    });

    if (openTransaction) {
      if (!this.isExpired(openTransaction.createTime)) {
        throw new PaymeError(
          PaymeErrorCode.UNABLE_TO_PERFORM,
          paymeMessage(
            "Bu to'lov uchun tugallanmagan tranzaksiya mavjud",
            'По этому платежу уже есть незавершенная транзакция',
            'There is a pending transaction for this payment',
          ),
        );
      }

      // Eskisi muddati o'tgan - uni yopib, yangisiga yo'l ochamiz.
      await this.cancelExpired(openTransaction.id);
    }

    const now = Date.now();

    const created = await this.prisma.paymeTransaction.create({
      data: {
        paycomId,
        paycomTime: this.readTime(params?.time),
        createTime: BigInt(now),
        amount: new Prisma.Decimal(Number(params?.amount ?? 0)),
        state: PaymeState.CREATED,
        paymentId: payment.id,
      },
    });

    this.logger.log(
      `Payme tranzaksiya yaratildi: paycomId=${paycomId}, paymentId=${payment.id}`,
    );

    return {
      create_time: Number(created.createTime),
      transaction: String(created.id),
      state: created.state,
    };
  }

  // --------------------------------------------------- PerformTransaction

  async performTransaction(params: Record<string, unknown>) {
    const transaction = await this.findTransaction(params);

    // Allaqachon bajarilgan - o'sha javobni qaytaramiz, ikkinchi marta
    // to'lovni PAID qilmaymiz.
    if (transaction.state === PaymeState.PERFORMED) {
      return {
        transaction: String(transaction.id),
        perform_time: Number(transaction.performTime),
        state: transaction.state,
      };
    }

    if (transaction.state !== PaymeState.CREATED) {
      throw new PaymeError(
        PaymeErrorCode.UNABLE_TO_PERFORM,
        paymeMessage(
          'Tranzaksiya bekor qilingan',
          'Транзакция отменена',
          'Transaction is canceled',
        ),
      );
    }

    if (this.isExpired(transaction.createTime)) {
      await this.cancelExpired(transaction.id);

      throw new PaymeError(
        PaymeErrorCode.UNABLE_TO_PERFORM,
        paymeMessage(
          'Tranzaksiya muddati tugagan',
          'Срок транзакции истек',
          'Transaction is expired',
        ),
      );
    }

    // Tranzaksiya yaratilgandan keyin 12 soatgacha vaqt bor - shu orada
    // admin to'lovni naqd sifatida belgilab qo'ygan bo'lishi mumkin. Unda
    // bu yerda `PAID` qilish o'quvchidan ikkinchi marta pul olish demak.
    // Xato qaytarsak Payme tranzaksiyani bekor qiladi va pulni qaytaradi.
    const payment = await this.prisma.payment.findUnique({
      where: { id: transaction.paymentId },
      select: { status: true },
    });

    if (payment?.status === PaymentStatus.PAID) {
      throw new PaymeError(
        PaymeErrorCode.UNABLE_TO_PERFORM,
        paymeMessage(
          "Bu to'lov allaqachon amalga oshirilgan",
          'Платеж уже оплачен',
          'Payment is already paid',
        ),
      );
    }

    const performTime = BigInt(Date.now());

    // Tranzaksiya va to'lov holati birga yangilanadi: biri yozilib, ikkinchisi
    // yozilmay qolsa hisobot buziladi.
    const [updated] = await this.prisma.$transaction([
      this.prisma.paymeTransaction.update({
        where: { id: transaction.id },
        data: { state: PaymeState.PERFORMED, performTime },
      }),
      this.prisma.payment.update({
        where: { id: transaction.paymentId },
        data: {
          status: PaymentStatus.PAID,
          method: PaymentMethod.PAYME,
          paidAt: new Date(),
        },
      }),
    ]);

    this.logger.log(
      `Payme to'lov tasdiqlandi: paymentId=${transaction.paymentId}`,
    );

    return {
      transaction: String(updated.id),
      perform_time: Number(updated.performTime),
      state: updated.state,
    };
  }

  // ---------------------------------------------------- CancelTransaction

  async cancelTransaction(params: Record<string, unknown>) {
    const transaction = await this.findTransaction(params);

    // Allaqachon bekor qilingan bo'lsa - o'sha javob qaytadi.
    if (
      transaction.state === PaymeState.CANCELED ||
      transaction.state === PaymeState.CANCELED_AFTER_PERFORM
    ) {
      return {
        transaction: String(transaction.id),
        cancel_time: Number(transaction.cancelTime),
        state: transaction.state,
      };
    }

    const reason = Number(params?.reason) || null;
    const cancelTime = BigInt(Date.now());

    const performed = transaction.state === PaymeState.PERFORMED;

    const nextState = performed
      ? PaymeState.CANCELED_AFTER_PERFORM
      : PaymeState.CANCELED;

    const [updated] = await this.prisma.$transaction([
      this.prisma.paymeTransaction.update({
        where: { id: transaction.id },
        data: { state: nextState, cancelTime, reason },
      }),
      // `updateMany` - chunki mos yozuv topilmasa `update` P2025 tashlaydi va
      // butun tranzaksiyani, jumladan yuqoridagi holat yangilanishini ham,
      // orqaga qaytarib yuboradi. Bu yerda esa "hech nima o'zgarmadi" to'g'ri
      // natija.
      this.prisma.payment.updateMany({
        // Tranzaksiya to'lanmagan bo'lsa, to'lovni faqat u hali `PENDING`
        // bo'lgandagina bekor qilamiz. Aks holda naqd qabul qilingan yoki
        // boshqa tranzaksiya orqali to'langan yozuv shu yerda `CANCELED` ga
        // aylanib, haqiqatan olingan pul hisobotdan yo'qolib ketardi.
        where: performed
          ? { id: transaction.paymentId }
          : { id: transaction.paymentId, status: PaymentStatus.PENDING },
        data: {
          status: PaymentStatus.CANCELED,
          // To'langan bo'lib keyin qaytarilgan bo'lsa `paidAt` tozalanadi,
          // aks holda hisobotda to'langan bo'lib ko'rinib qoladi.
          paidAt: null,
        },
      }),
    ]);

    this.logger.warn(
      `Payme tranzaksiya bekor qilindi: paymentId=${transaction.paymentId}, sabab=${reason}`,
    );

    return {
      transaction: String(updated.id),
      cancel_time: Number(updated.cancelTime),
      state: updated.state,
    };
  }

  // ----------------------------------------------------- CheckTransaction

  async checkTransaction(params: Record<string, unknown>) {
    const transaction = await this.findTransaction(params);

    return {
      create_time: Number(transaction.createTime),
      perform_time: Number(transaction.performTime),
      cancel_time: Number(transaction.cancelTime),
      transaction: String(transaction.id),
      state: transaction.state,
      reason: transaction.reason ?? null,
    };
  }

  // --------------------------------------------------------- GetStatement

  /** Payme hisob-kitobni solishtirish uchun davr bo'yicha ro'yxat so'raydi. */
  async getStatement(params: Record<string, unknown>) {
    const from = Number(params?.from) || 0;
    const to = Number(params?.to) || Date.now();

    const transactions = await this.prisma.paymeTransaction.findMany({
      where: { paycomTime: { gte: BigInt(from), lte: BigInt(to) } },
      orderBy: { paycomTime: 'asc' },
      include: { payment: { select: { studentId: true, groupId: true } } },
    });

    return {
      transactions: transactions.map((item) => ({
        id: item.paycomId,
        time: Number(item.paycomTime),
        amount: this.toNumber(item.amount),
        account: {
          payment_id: String(item.paymentId),
          student_id: String(item.payment.studentId),
          group_id: String(item.payment.groupId),
        },
        create_time: Number(item.createTime),
        perform_time: Number(item.performTime),
        cancel_time: Number(item.cancelTime),
        transaction: String(item.id),
        state: item.state,
        reason: item.reason ?? null,
      })),
    };
  }

  // ------------------------------------------------------------- helpers

  private async findTransaction(params: Record<string, unknown>) {
    const paycomId = String(params?.id ?? '');

    const transaction = paycomId
      ? await this.prisma.paymeTransaction.findUnique({ where: { paycomId } })
      : null;

    if (!transaction) {
      throw new PaymeError(
        PaymeErrorCode.TRANSACTION_NOT_FOUND,
        paymeMessage(
          'Tranzaksiya topilmadi',
          'Транзакция не найдена',
          'Transaction not found',
        ),
      );
    }

    return transaction;
  }

  /** Muddati o'tgan tranzaksiyani yopadi va to'lovni bo'shatadi. */
  private async cancelExpired(transactionId: number) {
    const cancelTime = BigInt(Date.now());

    await this.prisma.paymeTransaction.update({
      where: { id: transactionId },
      data: {
        state: PaymeState.CANCELED,
        cancelTime,
        reason: PAYME_REASON_TIMEOUT,
      },
    });
  }
}
