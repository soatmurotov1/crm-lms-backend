import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Bitta sahifada qaytariladigan yozuvlarning eng ko'p soni. */
export const MAX_PAGE_SIZE = 200;

/**
 * Sahifa so'ralmaganda qaytariladigan yozuvlarning yuqori chegarasi.
 *
 * Ilgari ro'yxat endpoint'lari butun jadvalni qaytarardi - 10 000 o'quvchida
 * bu bir necha megabaytlik javob va sekin sahifa degani. Endi chegara bor:
 * undan oshsa javobda `meta.hasMore = true` keladi va mijoz sahifalashga
 * o'tishi kerakligini biladi.
 */
export const MAX_UNPAGINATED_SIZE = 500;

/**
 * Ro'yxat endpoint'lari uchun umumiy sahifalash parametrlari.
 *
 * Ikkalasi ham ixtiyoriy: berilmasa eski xatti-harakat saqlanadi
 * (bir so'rovda hamma yozuv, lekin `MAX_UNPAGINATED_SIZE` chegarasi bilan).
 * Shu sabab bu o'zgarish mavjud mijozlarni buzmaydi.
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ example: 1, minimum: 1, description: 'Sahifa raqami' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "Sahifa raqami butun son bo'lishi kerak" })
  @Min(1, { message: "Sahifa raqami 1 dan kichik bo'lmasligi kerak" })
  page?: number;

  @ApiPropertyOptional({
    example: 20,
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
    description: `Bitta sahifadagi yozuvlar soni (eng ko'pi ${MAX_PAGE_SIZE})`,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "Limit butun son bo'lishi kerak" })
  @Min(1, { message: "Limit 1 dan kichik bo'lmasligi kerak" })
  @Max(MAX_PAGE_SIZE, { message: `Limit eng ko'pi ${MAX_PAGE_SIZE} bo'lishi mumkin` })
  limit?: number;
}

export interface PaginationMeta {
  /** Filtrga mos keladigan jami yozuvlar soni. */
  total: number;
  /** Joriy sahifa (sahifalash so'ralmagan bo'lsa 1). */
  page: number;
  /** Shu javobdagi yozuvlar soni uchun so'ralgan chegara. */
  limit: number;
  /** Jami sahifalar soni. */
  totalPages: number;
  /** Yana yozuv qolganini bildiradi. */
  hasMore: boolean;
}

export interface PaginatedResult<T> {
  success: true;
  data: T[];
  meta: PaginationMeta;
}
