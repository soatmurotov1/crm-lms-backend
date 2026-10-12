import { ApiPropertyOptional } from '@nestjs/swagger';
import { CourseType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, Matches, Min } from 'class-validator';
import { emptyToUndefined } from 'src/common/dto/transform.util';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = "Sana YYYY-MM-DD formatida bo'lishi kerak";

export class DashboardQueryDto {
  @ApiPropertyOptional({ example: '2026-10-01', description: 'Standart: oy boshi' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @Matches(DATE_KEY, { message: DATE_MESSAGE })
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-09', description: 'Standart: bugun' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @Matches(DATE_KEY, { message: DATE_MESSAGE })
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "Filial identifikatori butun son bo'lishi kerak" })
  @Min(1)
  branchId?: number;

  @ApiPropertyOptional({ enum: CourseType })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsEnum(CourseType, { message: "Noto'g'ri kurs turi" })
  courseType?: CourseType;

  @ApiPropertyOptional({ enum: ['day', 'week'], default: 'day' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(['day', 'week'], { message: "Davr 'day' yoki 'week' bo'lishi kerak" })
  granularity?: 'day' | 'week';
}
