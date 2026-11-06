import { CourseType, Prisma } from '@prisma/client';
import {
  computeBalances,
  debtorsOf,
  summarizeBalances,
  type BalanceStudent,
} from './v2-balance';

const d = (value: number) => new Prisma.Decimal(value);

const student = (overrides: Partial<BalanceStudent> = {}): BalanceStudent => ({
  studentId: 1,
  fullName: 'Ali Valiyev',
  branchId: 1,
  branchName: 'Asosiy filial',
  courseType: CourseType.AUTO_SCHOOL,
  ownPrice: d(1000),
  groupPrices: [],
  since: new Date('2026-09-01T00:00:00Z'),
  ...overrides,
});

describe('computeBalances', () => {
  it('qarz = narx − to‘langan', () => {
    const [balance] = computeBalances(
      [student()],
      [{ studentId: 1, paid: d(400) }],
    );

    expect(balance.totalPrice.toNumber()).toBe(1000);
    expect(balance.paid.toNumber()).toBe(400);
    expect(balance.debt.toNumber()).toBe(600);
  });

  it('to‘lov yozuvi yo‘q o‘quvchi to‘liq qarzdor', () => {
    const [balance] = computeBalances([student()], []);

    expect(balance.paid.toNumber()).toBe(0);
    expect(balance.debt.toNumber()).toBe(1000);
  });

  it('ortiqcha to‘lov manfiy qarz (avans) bo‘lib qoladi', () => {
    const [balance] = computeBalances(
      [student()],
      [{ studentId: 1, paid: d(1200) }],
    );

    expect(balance.debt.toNumber()).toBe(-200);
  });

  it('kelishilgan narx bo‘lmasa guruh kurslari narxi olinadi', () => {
    const [balance] = computeBalances(
      [student({ ownPrice: null, groupPrices: [d(700), d(300)] })],
      [{ studentId: 1, paid: d(100) }, { studentId: 1, paid: d(100) }],
    );

    expect(balance.totalPrice.toNumber()).toBe(1000);
    expect(balance.paid.toNumber()).toBe(200);
    expect(balance.debt.toNumber()).toBe(800);
  });
});

describe('summarizeBalances', () => {
  it('to‘liq, qisman va umuman to‘lamaganlarni ajratadi', () => {
    const balances = computeBalances(
      [
        student({ studentId: 1 }),
        student({ studentId: 2 }),
        student({ studentId: 3 }),
        student({ studentId: 4 }),
      ],
      [
        { studentId: 1, paid: d(1000) },
        { studentId: 2, paid: d(250) },
        // Ortiqcha to'lov boshqa o'quvchining qarzini kamaytirmaydi.
        { studentId: 4, paid: d(1500) },
      ],
    );

    const totals = summarizeBalances(balances);

    expect(totals).toMatchObject({
      students: 4,
      fullyPaid: 2,
      partial: 1,
      unpaid: 1,
    });
    expect(totals.totalPrice.toNumber()).toBe(4000);
    expect(totals.paid.toNumber()).toBe(2250);
    expect(totals.debt.toNumber()).toBe(1750);
  });
});

describe('debtorsOf', () => {
  it('qarzi yo‘qlarni tashlaydi va kattasidan boshlab tartiblaydi', () => {
    const balances = computeBalances(
      [
        student({ studentId: 1 }),
        student({ studentId: 2 }),
        student({ studentId: 3 }),
        student({ studentId: 4 }),
      ],
      [
        { studentId: 1, paid: d(1000) },
        { studentId: 2, paid: d(900) },
        // 3 va 4 ning qarzi teng — id bo'yicha barqaror tartib.
      ],
    );

    expect(debtorsOf(balances).map((balance) => balance.studentId)).toEqual([
      3, 4, 2,
    ]);
  });
});
