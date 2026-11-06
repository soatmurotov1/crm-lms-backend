import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const V2_MAX_LIMIT = 200;

/** `?page=&limit=` — frontend ro'yxatlari shu juftlik bilan ishlaydi. */
export class V2PageQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(V2_MAX_LIMIT)
  limit?: number;
}

export interface V2ListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export function pageOf(
  query: { page?: number; limit?: number },
  defaultLimit = 20,
) {
  const page = query.page ?? 1;
  const limit = Math.min(query.limit ?? defaultLimit, V2_MAX_LIMIT);

  return { page, limit, skip: (page - 1) * limit, take: limit };
}

export function listMeta(total: number, page: number, limit: number): V2ListMeta {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;

  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

/** `{ data: [...], meta: {...} }` — frontendning standart ro'yxat javobi. */
export const paginated = <T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
) => ({ data, meta: listMeta(total, page, limit) });

/** Xotirada tayyorlangan ro'yxatni sahifalash (kichik ro'yxatlar uchun). */
export function paginateArray<T>(
  rows: T[],
  query: { page?: number; limit?: number },
  defaultLimit = 20,
) {
  const { page, limit, skip } = pageOf(query, defaultLimit);
  return paginated(rows.slice(skip, skip + limit), rows.length, page, limit);
}
