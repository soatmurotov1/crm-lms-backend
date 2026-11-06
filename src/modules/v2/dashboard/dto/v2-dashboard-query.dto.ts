import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { emptyToUndefined } from 'src/common/dto/transform.util';
import type { V2CourseType } from '../../common/v2.mapper';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = 'Sana YYYY-MM-DD formatida bo‘lishi kerak';
const ID = /^\d{1,9}$/;

/** To'liq ISO vaqt kelsa ham faqat kalendar kuni olinadi. */
const toDateKey = (params: Parameters<typeof emptyToUndefined>[0]): unknown => {
  const value = emptyToUndefined(params);
  return typeof value === 'string' ? value.slice(0, 10) : value;
};

export class V2FinanceQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @Matches(ID, { message: 'Filial identifikatori noto‘g‘ri' })
  branch_id?: string;

  @ApiPropertyOptional({
    example: '2026-10-01',
    description: 'Standart: oy boshi',
  })
  @IsOptional()
  @Transform(toDateKey)
  @Matches(DATE_KEY, { message: DATE_MESSAGE })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-10-13',
    description: 'Standart: bugun',
  })
  @IsOptional()
  @Transform(toDateKey)
  @Matches(DATE_KEY, { message: DATE_MESSAGE })
  to?: string;
}

export class V2CompanyOverviewQueryDto extends V2FinanceQueryDto {
  @ApiPropertyOptional({ description: 'Faqat platforma egasi uchun' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @Matches(ID, { message: 'Tashkilot identifikatori noto‘g‘ri' })
  company_id?: string;

  @ApiPropertyOptional({ enum: ['tezkor', 'avto_maktab'] })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(['tezkor', 'avto_maktab'], { message: 'Noto‘g‘ri kurs turi' })
  course_type?: V2CourseType;

  @ApiPropertyOptional({ enum: ['day', 'week'], default: 'day' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(['day', 'week'], { message: 'Davr ‘day’ yoki ‘week’ bo‘lishi kerak' })
  granularity?: 'day' | 'week';
}

/** `GET /dashboard/analytics` */
export class V2AnalyticsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @Matches(ID, { message: 'Filial identifikatori noto‘g‘ri' })
  branch_id?: string;

  @ApiPropertyOptional({ description: 'Faqat platforma egasi uchun' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @Matches(ID, { message: 'Tashkilot identifikatori noto‘g‘ri' })
  company_id?: string;

  @ApiPropertyOptional({ enum: ['tezkor', 'avto_maktab'] })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(['tezkor', 'avto_maktab'], { message: 'Noto‘g‘ri kurs turi' })
  course_type?: V2CourseType;
}
