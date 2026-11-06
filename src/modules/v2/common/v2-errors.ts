import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** Unikal cheklov buzilsa (P2002) — tushunarli 409, qolgani o'zgarmaydi. */
export async function uniqueGuard<T>(
  action: () => Promise<T>,
  message: string,
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (isUniqueViolation(error)) throw new ConflictException(message);
    throw error;
  }
}

export const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

/**
 * Optimistik qulf: yozuv o'qilgandan keyin boshqa birov o'zgartirgan.
 * Frontend `details.reason === 'concurrent_update'` ni taniydi.
 */
export class ConcurrentUpdateException extends ConflictException {
  constructor() {
    super({
      message: 'Yozuv boshqa foydalanuvchi tomonidan o‘zgartirilgan',
      details: { reason: 'concurrent_update' },
    });
  }
}
