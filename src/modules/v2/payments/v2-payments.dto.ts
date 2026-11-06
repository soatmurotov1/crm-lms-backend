import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { V2PageQueryDto } from '../common/v2-pagination';
import {
  DATE_ONLY,
  emptyToUndefined,
  toIdString,
  trim,
} from '../common/v2-dto.util';

export const PAYMENT_METHODS = ['naqd', 'karta', 'perechisleniya'] as const;
const COURSE_TYPES = ['tezkor', 'avto_maktab'];
const SORTS = ['student_name', 'amount_paid', 'remaining_debt', 'date'];

const dateOnly = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 10)
    : undefined;

/** Filtrlar — ro'yxat va yig'indi uchun bir xil. Eski nomlar ham qabul qilinadi. */
export class V2PaymentsQueryDto extends V2PageQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  branch_id?: string;

  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  company_id?: string;

  @ApiPropertyOptional({ enum: COURSE_TYPES })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(COURSE_TYPES)
  course_type?: 'tezkor' | 'avto_maktab';

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @Transform(dateOnly)
  @Matches(DATE_ONLY)
  start_date?: string;

  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  @Transform(dateOnly)
  @Matches(DATE_ONLY)
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @Transform(dateOnly)
  @Matches(DATE_ONLY)
  end_date?: string;

  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  @Transform(dateOnly)
  @Matches(DATE_ONLY)
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    enum: ['paid', 'unpaid'],
    description: 'O‘quvchining joriy holati: to‘liq to‘lagan yoki qarzdor',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(['paid', 'unpaid'])
  payment_status?: 'paid' | 'unpaid';

  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(['paid', 'unpaid', 'true', 'false'])
  paymentStatus?: string;

  @ApiPropertyOptional({ enum: PAYMENT_METHODS })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(PAYMENT_METHODS)
  payment_method?: (typeof PAYMENT_METHODS)[number];

  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(PAYMENT_METHODS)
  payment_type?: (typeof PAYMENT_METHODS)[number];

  @ApiPropertyOptional({ enum: SORTS })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(SORTS)
  sort_by?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(['asc', 'desc'])
  sort_order?: 'asc' | 'desc';

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  student_id?: string;
}

export class V2PaymentSnapshotQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  branch_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  company_id?: string;
}

export class V2CreatePaymentDto {
  @ApiProperty({ example: 500000 })
  @Type(() => Number)
  @IsNumber()
  @Min(1, { message: 'Summa musbat bo‘lishi kerak' })
  amount: number;

  @ApiPropertyOptional({ description: 'Takroriy so‘rovdan himoya kaliti' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  idempotency_key?: string;

  @ApiProperty({ enum: PAYMENT_METHODS })
  @IsIn(PAYMENT_METHODS, { message: 'To‘lov usuli noto‘g‘ri' })
  payment_method: (typeof PAYMENT_METHODS)[number];

  @ApiProperty()
  @Transform(toIdString)
  @IsString()
  @IsNotEmpty()
  student_id: string;
}

export class V2UpdatePaymentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1, { message: 'Summa musbat bo‘lishi kerak' })
  amount?: number;

  @ApiPropertyOptional({ enum: PAYMENT_METHODS })
  @IsOptional()
  @IsIn(PAYMENT_METHODS, { message: 'To‘lov usuli noto‘g‘ri' })
  payment_method?: (typeof PAYMENT_METHODS)[number];
}
