import { BadRequestException, Injectable } from '@nestjs/common';
import {
  PaymentMethod,
  PaymentStatus,
  Prisma,
  Status,
  type Payment,
} from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { tashkentDateKey } from 'src/common/utils/tashkent-time.util';
import type { V2Actor } from './v2-auth.guard';

type Tx = Prisma.TransactionClient | PrismaService;

export interface RecordPaymentInput {
  studentId: number;
  amount: number | Prisma.Decimal;
  method: PaymentMethod;
  /** Takroriy so'rov (tarmoq uzilishi) ikkinchi to'lov yaratmasligi uchun. */
  idempotencyKey?: string | null;
  paidAt?: Date;
}

/**
 * O'quvchi to'lovini yozish — o'quvchi yaratish, tahrirlash va
 * `POST /payments` bitta yo'ldan o'tadi.
 *
 * To'lov guruhga emas, o'quvchiga tegishli. Guruh va kurs (bo'lsa) eski
 * panel hisobotlari uchun yoziladi.
 */
@Injectable()
export class V2LedgerService {
  constructor(private prisma: PrismaService) {}

  async record(
    actor: V2Actor,
    input: RecordPaymentInput,
    tx: Tx = this.prisma,
  ): Promise<{ payment: Payment; replayed: boolean }> {
    const amount = new Prisma.Decimal(input.amount);
    if (!amount.greaterThan(0)) {
      throw new BadRequestException('To‘lov summasi musbat bo‘lishi kerak');
    }

    if (input.idempotencyKey) {
      const existing = await tx.payment.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        if (existing.studentId !== input.studentId) {
          throw new BadRequestException('Takroriy so‘rov kaliti noto‘g‘ri');
        }
        return { payment: existing, replayed: true };
      }
    }

    const student = await tx.student.findUnique({
      where: { id: input.studentId },
      select: {
        branchId: true,
        courseId: true,
        studentGroups: {
          where: { status: Status.ACTIVE },
          select: { groupId: true, group: { select: { courseId: true } } },
          orderBy: { created_at: 'asc' },
          take: 1,
        },
      },
    });
    if (!student) throw new BadRequestException('O‘quvchi topilmadi');

    const paidAt = input.paidAt ?? new Date();
    const [year, month] = tashkentDateKey(paidAt).split('-').map(Number);
    const membership = student.studentGroups[0];

    const payment = await tx.payment.create({
      data: {
        studentId: input.studentId,
        groupId: membership?.groupId ?? null,
        courseId: membership?.group.courseId ?? student.courseId ?? null,
        branchId: student.branchId,
        amount,
        status: PaymentStatus.PAID,
        method: input.method,
        year,
        month,
        paidAt,
        recordedById: actor.ref.kind === 'user' ? actor.ref.id : null,
        recordedByName: actor.name,
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });

    return { payment, replayed: false };
  }
}
