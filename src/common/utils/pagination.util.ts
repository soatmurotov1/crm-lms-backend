import { Logger } from '@nestjs/common';
import {
  MAX_UNPAGINATED_SIZE,
  PaginatedResult,
  PaginationQueryDto,
} from '../dto/pagination.dto';

const logger = new Logger('Pagination');

/**
 * `skip` va `take` ni hisoblaydi.
 *
 * Sahifalash so'ralmagan bo'lsa ham `take` qaytadi - shu bilan bitta
 * noto'g'ri so'rov butun jadvalni xotiraga tortib kelolmaydi.
 */
export function resolvePagination(query?: PaginationQueryDto) {
  const requested = Boolean(query?.page || query?.limit);

  if (!requested) {
    return {
      requested: false,
      page: 1,
      // Bittaga ko'p so'raymiz: qaytgan yozuvlar soni chegaradan oshsa,
      // yana ma'lumot borligini alohida so'rovsiz bilib olamiz.
      take: MAX_UNPAGINATED_SIZE,
      skip: 0,
    };
  }

  const page = query?.page ?? 1;
  const take = query?.limit ?? 20;

  return { requested: true, page, take, skip: (page - 1) * take };
}

/**
 * Prisma'ning `findMany` + `count` natijasini yagona javob shakliga soladi.
 *
 * `data` avvalgidek massiv bo'lib qoladi - shuning uchun `meta` ni
 * ishlatmaydigan eski mijozlar hech nima sezmaydi.
 */
export function buildPaginatedResult<T>(
  rows: T[],
  total: number,
  query: PaginationQueryDto | undefined,
  context?: string,
): PaginatedResult<T> {
  const { requested, page, take } = resolvePagination(query);
  const hasMore = requested ? page * take < total : rows.length < total;

  if (!requested && hasMore) {
    // Bu jimgina kesib tashlash emas - `meta.hasMore` mijozga aytadi.
    // Log esa qaysi endpoint sahifalashga o'tishi kerakligini ko'rsatadi.
    logger.warn(
      `${context ?? "Ro'yxat"}: ${total} yozuvdan faqat ${rows.length} tasi qaytarildi. ` +
        'Mijoz `page` va `limit` parametrlariga o‘tishi kerak.',
    );
  }

  return {
    success: true,
    data: rows,
    meta: {
      total,
      page,
      limit: take,
      totalPages: Math.max(1, Math.ceil(total / take)),
      hasMore,
    },
  };
}
