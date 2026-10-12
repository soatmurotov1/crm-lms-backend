import { ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { PaginationQueryDto } from 'src/common/dto/pagination.dto';
import { emptyToUndefined } from 'src/common/dto/transform.util';

const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return value;
};

export class ExpenseQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ExpenseStatus })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsEnum(ExpenseStatus, { message: "Noto'g'ri holat" })
  status?: ExpenseStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Nomi bo‘yicha qidiruv' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Yaratilgan sana — boshlanishi (ISO)' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Yaratilgan sana — oxiri (ISO)' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Faqat muddati o‘tgan xarajatlar' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  overdue?: boolean;

  @ApiPropertyOptional({ description: 'O‘chirilganlar tarixi' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  deleted?: boolean;
}
