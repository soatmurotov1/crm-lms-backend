import { Prisma } from '@prisma/client';
import { bucketRevenue, computeDebts } from './dashboard.calc';

const d = (value: number | string) => new Prisma.Decimal(value);

const member = (
  studentId: number,
  groupId: number,
  price: number,
  fullName = `Talaba ${studentId}`,
  branchName: string | null = 'Asosiy filial',
) => ({ studentId, groupId, price: d(price), fullName, branchName });

describe('computeDebts', () => {
  it('qarz = kurs narxi − to‘langan', () => {
    const result = computeDebts(
      [member(1, 10, 1_000_000)],
      [{ studentId: 1, groupId: 10, paid: d(400_000) }],
    );

    expect(result.totalDebt).toBe(600_000);
    expect(result.debtorCount).toBe(1);
    expect(result.debtQueue).toEqual([
      {
        studentId: 1,
        fullName: 'Talaba 1',
        branchName: 'Asosiy filial',
        debt: 600_000,
      },
    ]);
  });

  it('ortiqcha to‘lov 0 ga qisiladi va qarzdor hisoblanmaydi', () => {
    const result = computeDebts(
      [member(1, 10, 1_000_000)],
      [{ studentId: 1, groupId: 10, paid: d(1_500_000) }],
    );

    expect(result).toEqual({ totalDebt: 0, debtorCount: 0, debtQueue: [] });
  });

  it('bir nechta guruh qarzi qo‘shiladi', () => {
    const result = computeDebts(
      [member(1, 10, 1_000_000), member(1, 11, 500_000)],
      [{ studentId: 1, groupId: 10, paid: d(250_000) }],
    );

    expect(result.totalDebt).toBe(1_250_000);
    expect(result.debtorCount).toBe(1);
  });

  // Review Focus 4: har guruh ALOHIDA qisiladi.
  it('bir guruhdagi ortiqcha to‘lov boshqa guruh qarzini yopmaydi', () => {
    const result = computeDebts(
      [member(1, 10, 1_000_000), member(1, 11, 500_000)],
      [{ studentId: 1, groupId: 10, paid: d(1_400_000) }],
    );

    expect(result.totalDebt).toBe(500_000);
  });

  it('to‘lov yozuvi yo‘q yoki yig‘indi null bo‘lsa butun narx qarz', () => {
    const result = computeDebts(
      [member(1, 10, 300_000), member(2, 10, 300_000)],
      [{ studentId: 2, groupId: 10, paid: null }],
    );

    expect(result.totalDebt).toBe(600_000);
    expect(result.debtorCount).toBe(2);
  });

  it('navbat: eng katta 3 ta, kamayish tartibida', () => {
    const result = computeDebts(
      [
        member(1, 10, 100),
        member(2, 10, 400),
        member(3, 10, 300),
        member(4, 10, 200),
      ],
      [],
    );

    expect(result.debtQueue.map((row) => row.studentId)).toEqual([2, 3, 4]);
    expect(result.debtorCount).toBe(4);
  });

  it('teng qarzlarda tartib barqaror (studentId bo‘yicha)', () => {
    const result = computeDebts(
      [member(7, 10, 100), member(3, 10, 100), member(5, 10, 100)],
      [],
    );

    expect(result.debtQueue.map((row) => row.studentId)).toEqual([3, 5, 7]);
  });

  it('kasrli summalar Decimal aniqligida qo‘shiladi', () => {
    const result = computeDebts([member(1, 10, 0.1), member(1, 11, 0.2)], []);

    expect(result.totalDebt).toBe(0.3);
  });

  it('bo‘sh kirish', () => {
    expect(computeDebts([], [])).toEqual({
      totalDebt: 0,
      debtorCount: 0,
      debtQueue: [],
    });
  });
});

describe('bucketRevenue', () => {
  const rows = [
    // 2026-10-05 dushanba (Toshkent)
    { paidAt: new Date('2026-10-05T06:00:00.000Z'), amount: d(100) },
    { paidAt: new Date('2026-10-05T12:00:00.000Z'), amount: d(50) },
    // UTC bo'yicha 6-oktabr 20:00 = Toshkentda 7-oktabr 01:00
    { paidAt: new Date('2026-10-06T20:00:00.000Z'), amount: d(30) },
    // Keyingi hafta: 12-oktabr dushanba
    { paidAt: new Date('2026-10-12T06:00:00.000Z'), amount: d(70) },
  ];

  it('kunlik: Toshkent kuni bo‘yicha guruhlaydi, sanasi o‘sish tartibida', () => {
    expect(bucketRevenue(rows, 'day')).toEqual([
      { bucket: '2026-10-05', amount: 150 },
      { bucket: '2026-10-07', amount: 30 },
      { bucket: '2026-10-12', amount: 70 },
    ]);
  });

  it('haftalik: dushanba sanasi bo‘yicha guruhlaydi', () => {
    expect(bucketRevenue(rows, 'week')).toEqual([
      { bucket: '2026-10-05', amount: 180 },
      { bucket: '2026-10-12', amount: 70 },
    ]);
  });

  it('paidAt bo‘sh yozuvni tashlab ketadi; hammasi bo‘sh bo‘lsa []', () => {
    expect(bucketRevenue([{ paidAt: null, amount: d(10) }], 'day')).toEqual([]);
    expect(bucketRevenue([], 'week')).toEqual([]);
  });
});
