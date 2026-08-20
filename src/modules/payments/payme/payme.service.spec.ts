import { Prisma, PaymentStatus } from '@prisma/client';
import { PaymeService } from './payme.service';
import { PaymeError, PaymeErrorCode, PaymeState } from './payme.types';
import type { PrismaService } from 'src/common/prisma/prisma.service';

/**
 * Payme Merchant API — pulga tegishli yo'llar.
 *
 * Bu yerda tekshiriladigan narsalar "kod ishlaydimi" emas, "pul yo'qolib
 * yoki ikki marta yechilib ketmaydimi" degan savolga javob beradi:
 *
 *  - summa mos kelmasa to'lov o'tmasligi;
 *  - Payme so'rovni qayta yuborganda ikkinchi tranzaksiya YARATILMASLIGI;
 *  - naqd qabul qilingan to'lov Payme orqali ikkinchi marta olinmasligi;
 *  - bekor qilish faqat kutilayotgan to'lovga tegishi.
 *
 * `PrismaService` mock qilinadi: bu qatlamda tekshirilayotgan narsa —
 * bazaning o'zi emas, xizmatning qaror qabul qilish mantig'i.
 */

type PrismaMock = {
  payment: {
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  paymeTransaction: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  $transaction: jest.Mock;
};

function createPrismaMock(): PrismaMock {
  return {
    payment: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    paymeTransaction: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    // Haqiqiy `$transaction` massivdagi so'rovlarni bajarib, natijalarni
    // qaytaradi — mock ham xuddi shunday qiladi.
    $transaction: jest.fn((operations: unknown[]) => Promise.all(operations)),
  };
}

/** 250 000 so'm = 25 000 000 tiyin. */
const AMOUNT_SOM = 250_000;
const AMOUNT_TIYIN = AMOUNT_SOM * 100;

const pendingPayment = {
  id: 42,
  amount: new Prisma.Decimal(AMOUNT_SOM),
  status: PaymentStatus.PENDING,
};

const account = { payment_id: String(pendingPayment.id) };

/**
 * `expect.objectContaining` `any` qaytaradi — ichma-ich ishlatilganda
 * tip tekshiruvi o'chib qoladi. Shuning uchun bir joyda yopib qo'yamiz.
 */
const containing = (shape: Record<string, unknown>): unknown =>
  expect.objectContaining(shape) as unknown;

describe('PaymeService', () => {
  let prisma: PrismaMock;
  let service: PaymeService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new PaymeService(prisma as unknown as PrismaService);

    // Log'lar test chiqishini to'ldirib yubormasligi uchun.
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  /** `PaymeError` va uning kodini bir joyda tekshirish uchun. */
  const expectPaymeError = async (promise: Promise<unknown>, code: number) => {
    await expect(promise).rejects.toBeInstanceOf(PaymeError);
    await promise.catch((error: PaymeError) => {
      expect(error.code).toBe(code);
    });
  };

  describe('checkPerformTransaction', () => {
    it("payment_id yo'q bo'lsa ACCOUNT_NOT_FOUND qaytaradi", async () => {
      await expectPaymeError(
        service.checkPerformTransaction({ account: {}, amount: AMOUNT_TIYIN }),
        PaymeErrorCode.ACCOUNT_NOT_FOUND,
      );

      expect(prisma.payment.findUnique).not.toHaveBeenCalled();
    });

    it("to'lov topilmasa ACCOUNT_NOT_FOUND qaytaradi", async () => {
      prisma.payment.findUnique.mockResolvedValue(null);

      await expectPaymeError(
        service.checkPerformTransaction({ account, amount: AMOUNT_TIYIN }),
        PaymeErrorCode.ACCOUNT_NOT_FOUND,
      );
    });

    it('summa mos kelmasa INVALID_AMOUNT qaytaradi', async () => {
      prisma.payment.findUnique.mockResolvedValue(pendingPayment);

      // Bir tiyin kam — o'tmasligi kerak.
      await expectPaymeError(
        service.checkPerformTransaction({
          account,
          amount: AMOUNT_TIYIN - 1,
        }),
        PaymeErrorCode.INVALID_AMOUNT,
      );
    });

    it("summa so'mda emas, tiyinda kutiladi", async () => {
      prisma.payment.findUnique.mockResolvedValue(pendingPayment);

      await expectPaymeError(
        service.checkPerformTransaction({ account, amount: AMOUNT_SOM }),
        PaymeErrorCode.INVALID_AMOUNT,
      );
    });

    it("allaqachon to'langan to'lovni qayta to'lashga yo'l qo'ymaydi", async () => {
      prisma.payment.findUnique.mockResolvedValue({
        ...pendingPayment,
        status: PaymentStatus.PAID,
      });

      await expectPaymeError(
        service.checkPerformTransaction({ account, amount: AMOUNT_TIYIN }),
        PaymeErrorCode.UNABLE_TO_PERFORM,
      );
    });

    it("ochiq tranzaksiya bo'lsa ikkinchisiga ruxsat bermaydi", async () => {
      prisma.payment.findUnique.mockResolvedValue(pendingPayment);
      prisma.paymeTransaction.findFirst.mockResolvedValue({
        id: 7,
        state: PaymeState.CREATED,
        createTime: BigInt(Date.now()),
      });

      await expectPaymeError(
        service.checkPerformTransaction({ account, amount: AMOUNT_TIYIN }),
        PaymeErrorCode.UNABLE_TO_PERFORM,
      );
    });

    it("hammasi joyida bo'lsa ruxsat beradi va hech nima yozmaydi", async () => {
      prisma.payment.findUnique.mockResolvedValue(pendingPayment);
      prisma.paymeTransaction.findFirst.mockResolvedValue(null);

      await expect(
        service.checkPerformTransaction({ account, amount: AMOUNT_TIYIN }),
      ).resolves.toEqual({ allow: true });

      expect(prisma.paymeTransaction.create).not.toHaveBeenCalled();
      expect(prisma.payment.update).not.toHaveBeenCalled();
    });
  });

  describe('createTransaction', () => {
    const paycomId = 'paycom-abc-1';

    it("takroriy so'rovda yangi tranzaksiya yaratmaydi (idempotentlik)", async () => {
      const createTime = BigInt(Date.now());

      prisma.paymeTransaction.findUnique.mockResolvedValue({
        id: 11,
        state: PaymeState.CREATED,
        createTime,
      });

      const result = await service.createTransaction({
        id: paycomId,
        account,
        amount: AMOUNT_TIYIN,
        time: Number(createTime),
      });

      expect(result).toEqual({
        create_time: Number(createTime),
        transaction: '11',
        state: PaymeState.CREATED,
      });

      // Eng muhimi: ikkinchi yozuv paydo bo'lmasligi.
      expect(prisma.paymeTransaction.create).not.toHaveBeenCalled();
    });

    it("muddati o'tgan takroriy tranzaksiyani yopib, xato qaytaradi", async () => {
      const expired = BigInt(Date.now() - 13 * 60 * 60 * 1000);

      prisma.paymeTransaction.findUnique.mockResolvedValue({
        id: 12,
        state: PaymeState.CREATED,
        createTime: expired,
      });
      prisma.paymeTransaction.update.mockResolvedValue({ id: 12 });

      await expectPaymeError(
        service.createTransaction({
          id: paycomId,
          account,
          amount: AMOUNT_TIYIN,
        }),
        PaymeErrorCode.UNABLE_TO_PERFORM,
      );

      expect(prisma.paymeTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 12 } }),
      );
    });

    it("yangi tranzaksiyani to'lovga bog'lab yaratadi", async () => {
      const now = Date.now();

      prisma.paymeTransaction.findUnique.mockResolvedValue(null);
      prisma.payment.findUnique.mockResolvedValue(pendingPayment);
      prisma.paymeTransaction.findFirst.mockResolvedValue(null);
      prisma.paymeTransaction.create.mockImplementation((args) => {
        const { data } = args as { data: Record<string, unknown> };
        return { id: 13, ...data };
      });

      const result = await service.createTransaction({
        id: paycomId,
        account,
        amount: AMOUNT_TIYIN,
        time: now,
      });

      expect(result.transaction).toBe('13');
      expect(result.state).toBe(PaymeState.CREATED);

      expect(prisma.paymeTransaction.create).toHaveBeenCalledWith({
        data: containing({
          paycomId,
          paymentId: pendingPayment.id,
          state: PaymeState.CREATED,
        }),
      });
    });
  });

  describe('performTransaction', () => {
    const paycomId = 'paycom-abc-2';

    it("to'lovni PAID qiladi va tranzaksiyani PERFORMED ga o'tkazadi", async () => {
      prisma.paymeTransaction.findUnique.mockResolvedValue({
        id: 21,
        paymentId: pendingPayment.id,
        state: PaymeState.CREATED,
        createTime: BigInt(Date.now()),
      });
      prisma.payment.findUnique.mockResolvedValue({
        status: PaymentStatus.PENDING,
      });
      prisma.paymeTransaction.update.mockImplementation((args) => {
        const { data } = args as { data: Record<string, unknown> };
        return { id: 21, ...data };
      });
      prisma.payment.update.mockResolvedValue({ id: pendingPayment.id });

      const result = await service.performTransaction({ id: paycomId });

      expect(result.state).toBe(PaymeState.PERFORMED);

      // Ikkalasi bitta tranzaksiyada yozilishi shart: biri yozilib
      // ikkinchisi yozilmay qolsa hisobot buziladi.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: containing({ status: PaymentStatus.PAID }),
        }),
      );
    });

    it("allaqachon bajarilgan tranzaksiyani ikkinchi marta o'tkazmaydi", async () => {
      const performTime = BigInt(Date.now());

      prisma.paymeTransaction.findUnique.mockResolvedValue({
        id: 22,
        paymentId: pendingPayment.id,
        state: PaymeState.PERFORMED,
        performTime,
        createTime: BigInt(Date.now()),
      });

      const result = await service.performTransaction({ id: paycomId });

      expect(result).toEqual({
        transaction: '22',
        perform_time: Number(performTime),
        state: PaymeState.PERFORMED,
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("naqd qabul qilingan to'lovni Payme orqali qayta yechmaydi", async () => {
      prisma.paymeTransaction.findUnique.mockResolvedValue({
        id: 23,
        paymentId: pendingPayment.id,
        state: PaymeState.CREATED,
        createTime: BigInt(Date.now()),
      });
      // Tranzaksiya ochilgandan keyin admin naqd sifatida belgilab qo'ygan.
      prisma.payment.findUnique.mockResolvedValue({
        status: PaymentStatus.PAID,
      });

      await expectPaymeError(
        service.performTransaction({ id: paycomId }),
        PaymeErrorCode.UNABLE_TO_PERFORM,
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("muddati o'tgan tranzaksiyani bajarmaydi", async () => {
      prisma.paymeTransaction.findUnique.mockResolvedValue({
        id: 24,
        paymentId: pendingPayment.id,
        state: PaymeState.CREATED,
        createTime: BigInt(Date.now() - 13 * 60 * 60 * 1000),
      });
      prisma.paymeTransaction.update.mockResolvedValue({ id: 24 });

      await expectPaymeError(
        service.performTransaction({ id: paycomId }),
        PaymeErrorCode.UNABLE_TO_PERFORM,
      );

      expect(prisma.payment.update).not.toHaveBeenCalled();
    });
  });

  describe('cancelTransaction', () => {
    const paycomId = 'paycom-abc-3';

    it("to'lanmagan tranzaksiyada faqat PENDING to'lovni bekor qiladi", async () => {
      prisma.paymeTransaction.findUnique.mockResolvedValue({
        id: 31,
        paymentId: pendingPayment.id,
        state: PaymeState.CREATED,
        createTime: BigInt(Date.now()),
      });
      prisma.paymeTransaction.update.mockImplementation((args) => {
        const { data } = args as { data: Record<string, unknown> };
        return { id: 31, ...data };
      });
      prisma.payment.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.cancelTransaction({
        id: paycomId,
        reason: 3,
      });

      expect(result.state).toBe(PaymeState.CANCELED);

      /*
        Shart ichida `status: PENDING` bo'lishi muhim: usiz naqd qabul
        qilingan yoki boshqa tranzaksiya orqali to'langan yozuv ham
        CANCELED ga aylanib, haqiqatan olingan pul hisobotdan yo'qolardi.
      */
      expect(prisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: pendingPayment.id,
            status: PaymentStatus.PENDING,
          },
        }),
      );
    });

    it("to'langan tranzaksiya bekor qilinsa CANCELED_AFTER_PERFORM bo'ladi", async () => {
      prisma.paymeTransaction.findUnique.mockResolvedValue({
        id: 32,
        paymentId: pendingPayment.id,
        state: PaymeState.PERFORMED,
        createTime: BigInt(Date.now()),
      });
      prisma.paymeTransaction.update.mockImplementation((args) => {
        const { data } = args as { data: Record<string, unknown> };
        return { id: 32, ...data };
      });
      prisma.payment.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.cancelTransaction({ id: paycomId });

      expect(result.state).toBe(PaymeState.CANCELED_AFTER_PERFORM);

      // Pul qaytarilgani uchun `paidAt` tozalanishi kerak, aks holda
      // hisobotda to'langan bo'lib qolib ketadi.
      expect(prisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: pendingPayment.id },
          data: containing({ paidAt: null }),
        }),
      );
    });

    it('takroran bekor qilinsa holatni o‘zgartirmaydi', async () => {
      const cancelTime = BigInt(Date.now());

      prisma.paymeTransaction.findUnique.mockResolvedValue({
        id: 33,
        paymentId: pendingPayment.id,
        state: PaymeState.CANCELED,
        cancelTime,
        createTime: BigInt(Date.now()),
      });

      const result = await service.cancelTransaction({ id: paycomId });

      expect(result).toEqual({
        transaction: '33',
        cancel_time: Number(cancelTime),
        state: PaymeState.CANCELED,
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
