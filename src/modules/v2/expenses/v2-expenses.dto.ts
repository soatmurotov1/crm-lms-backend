import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { V2PageQueryDto } from '../common/v2-pagination';
import {
  DATE_ONLY,
  MONEY_STRING,
  MONTH_KEY,
  emptyToUndefined,
  trim,
} from '../common/v2-dto.util';
import { PAYMENT_METHODS } from '../payments/v2-payments.dto';

/** Oddiy xarajat turlari (o'qituvchi hisob-kitobi alohida endpointdan). */
export const EXPENSE_CATEGORIES = [
  'rent',
  'utilities',
  'marketing',
  'supplies',
  'administrative',
  'other',
] as const;
export const ALL_EXPENSE_CATEGORIES = [
  ...EXPENSE_CATEGORIES,
  'teacher_settlement',
] as const;
export const EXPENSE_STATUSES = [
  'planned',
  'partially_paid',
  'paid',
  'cancelled',
] as const;

export type V2ExpenseCategory = (typeof ALL_EXPENSE_CATEGORIES)[number];
export type V2ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

const dateOnly = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 10)
    : value === null
      ? null
      : undefined;

export class V2ExpensesQueryDto extends V2PageQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  branch_id?: string;

  @ApiPropertyOptional({ enum: ['company'] })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(['company'])
  scope?: 'company';

  @ApiPropertyOptional({ enum: ALL_EXPENSE_CATEGORIES })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(ALL_EXPENSE_CATEGORIES)
  category?: V2ExpenseCategory;

  @ApiPropertyOptional({ enum: EXPENSE_STATUSES })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(EXPENSE_STATUSES)
  status?: V2ExpenseStatus;

  @ApiPropertyOptional({ enum: ['overdue'] })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(['overdue'])
  attention?: 'overdue';

  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @Transform(dateOnly)
  @Matches(DATE_ONLY)
  date_from?: string;

  @ApiPropertyOptional({ example: '2026-11-30' })
  @IsOptional()
  @Transform(dateOnly)
  @Matches(DATE_ONLY)
  date_to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class V2ExpenseTriageQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  branch_id?: string;

  @ApiPropertyOptional({ enum: ['company'] })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(['company'])
  scope?: 'company';
}

export class V2DeletedExpensesQueryDto extends V2PageQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class V2ExpenseMonthCloseQueryDto {
  @ApiProperty({ example: '2026-11' })
  @Matches(MONTH_KEY)
  month!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  branch_id?: string;
}

class ExpenseMetaDto {
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(dateOnly)
  @Matches(DATE_ONLY)
  due_date?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  payee?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}

export class V2CreateExpenseDto extends ExpenseMetaDto {
  @ApiProperty({ enum: EXPENSE_CATEGORIES })
  @IsIn(EXPENSE_CATEGORIES)
  category!: (typeof EXPENSE_CATEGORIES)[number];

  @ApiProperty({ example: 'Noyabr ijarasi' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ example: '1500000.00' })
  @Matches(MONEY_STRING)
  amount!: string;

  @ApiProperty({ example: '2026-11-06' })
  @Transform(dateOnly)
  @Matches(DATE_ONLY)
  expense_date!: string;

  @ApiPropertyOptional({ description: 'Bo‘sh — butun markaz bo‘yicha' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  branch_id?: string | null;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  idempotency_key!: string;
}

export class V2UpdateExpenseDto extends ExpenseMetaDto {
  @ApiPropertyOptional({ enum: EXPENSE_CATEGORIES })
  @IsOptional()
  @IsIn(EXPENSE_CATEGORIES)
  category?: (typeof EXPENSE_CATEGORIES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(MONEY_STRING)
  amount?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(dateOnly)
  @Matches(DATE_ONLY)
  expense_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  branch_id?: string | null;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expected_version!: number;
}

export class V2ExpenseLifecycleDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expected_version!: number;
}

export class V2CreateExpensePaymentDto {
  @ApiProperty({ example: '500000.00' })
  @Matches(MONEY_STRING)
  amount!: string;

  @ApiProperty({ enum: PAYMENT_METHODS })
  @IsIn(PAYMENT_METHODS)
  payment_method!: (typeof PAYMENT_METHODS)[number];

  @ApiProperty({ example: '2026-11-06' })
  @Transform(dateOnly)
  @Matches(DATE_ONLY)
  date!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  note?: string | null;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  idempotency_key!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expected_version!: number;
}

export class V2CreateTeacherSettlementDto extends ExpenseMetaDto {
  @ApiProperty({ example: 't3' })
  @IsString()
  @IsNotEmpty()
  teacher_id!: string;

  @ApiProperty({ example: '2026-11' })
  @Matches(MONTH_KEY)
  period_month!: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ example: '3000000.00' })
  @Matches(MONEY_STRING)
  amount!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  idempotency_key!: string;
}
