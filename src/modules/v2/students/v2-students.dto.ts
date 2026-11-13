import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PHONE_REGEX, normalizePhone } from 'src/common/utils/phone.util';
import { V2PageQueryDto } from '../common/v2-pagination';
import {
  DATE_ONLY,
  emptyToUndefined,
  toBool,
  toIdString,
  trim,
} from '../common/v2-dto.util';

export const COURSE_TYPES = ['online', 'offline'] as const;
export const PAYMENT_METHODS = ['naqd', 'karta', 'perechisleniya'] as const;
export const STUDENT_STATUSES = [
  'active',
  'completed',
  'dropped',
  'suspended',
] as const;
export const RESULTS = ['oqimoqda', 'topshirdi', 'yiqildi'] as const;
export const LEAD_SOURCES = [
  'referral',
  'instagram',
  'directory_map',
  'telegram',
  'walk_in',
  'olx',
  'other',
] as const;
const SORTS = ['first_name', 'last_name', 'total_price', 'debt', 'created_at'];

const phone = ({ value }: { value: unknown }) => normalizePhone(value);
/** Sana `YYYY-MM-DD` yoki to'liq ISO ko'rinishida kelishi mumkin. */
const dateOnly = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 10)
    : undefined;

export class V2StudentsQueryDto extends V2PageQueryDto {
  @ApiPropertyOptional({ enum: COURSE_TYPES })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(COURSE_TYPES)
  course_type?: (typeof COURSE_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  branch_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  company_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  course_id?: string;

  @ApiPropertyOptional({ description: 'Ro‘yxatga olgan operator' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  operator_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @Transform(dateOnly)
  @Matches(DATE_ONLY)
  date_from?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @Transform(dateOnly)
  @Matches(DATE_ONLY)
  date_to?: string;

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
  @Transform(toBool)
  @IsBoolean()
  has_debt?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  has_group?: boolean;

  @ApiPropertyOptional({ enum: STUDENT_STATUSES })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(STUDENT_STATUSES)
  status?: (typeof STUDENT_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  referred_by_user_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  referred_by_student_id?: string;

  @ApiPropertyOptional({ description: 'O‘chirilganlarni ham (faqat egasi)' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  include_deleted?: boolean;
}

/** Yaratish va tahrirlashda umumiy maydonlar. */
class V2StudentFieldsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ description: 'To‘lov (online: boshlang‘ich, tahrirda: qo‘shimcha)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount_paid?: number;

  @ApiPropertyOptional({ example: '2000-05-17' })
  @IsOptional()
  @Transform(dateOnly)
  @Matches(DATE_ONLY, { message: 'Tug‘ilgan sana noto‘g‘ri' })
  birth_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toIdString)
  @Transform(emptyToUndefined)
  @IsString()
  branch_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(dateOnly)
  @Matches(DATE_ONLY, { message: 'Tugash sanasi noto‘g‘ri' })
  completion_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  contract_number?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toIdString)
  @Transform(emptyToUndefined)
  @IsString()
  course_id?: string;

  @ApiPropertyOptional({ enum: ['male', 'female'] })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(['male', 'female'])
  gender?: 'male' | 'female';

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toIdString)
  @IsString()
  group_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  has_document?: boolean;

  @ApiPropertyOptional({ description: 'Oflayn kurs: boshlang‘ich to‘lov' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  initial_payment?: number;

  @ApiPropertyOptional({ enum: LEAD_SOURCES })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(LEAD_SOURCES)
  lead_source?: (typeof LEAD_SOURCES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  lead_source_other?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(16)
  passport_number?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(8)
  passport_series?: string;

  @ApiPropertyOptional({ enum: PAYMENT_METHODS })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(PAYMENT_METHODS)
  payment_method?: (typeof PAYMENT_METHODS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toIdString)
  @Transform(emptyToUndefined)
  @IsString()
  referred_by_student_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toIdString)
  @Transform(emptyToUndefined)
  @IsString()
  referred_by_user_id?: string;

  @ApiPropertyOptional({ description: 'Ro‘yxatga olgan operator' })
  @IsOptional()
  @Transform(toIdString)
  @Transform(emptyToUndefined)
  @IsString()
  registered_by?: string;

  @ApiPropertyOptional({ enum: RESULTS })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(RESULTS)
  result?: (typeof RESULTS)[number];

  @ApiPropertyOptional({ enum: STUDENT_STATUSES })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(STUDENT_STATUSES)
  status?: (typeof STUDENT_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  middle_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(dateOnly)
  @Matches(DATE_ONLY)
  start_date?: string;
}

export class V2CreateStudentDto extends V2StudentFieldsDto {
  @ApiProperty({ enum: COURSE_TYPES })
  @IsIn(COURSE_TYPES, { message: 'Noto‘g‘ri kurs turi' })
  course_type: (typeof COURSE_TYPES)[number];

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Ism kiritilishi kerak' })
  @MaxLength(80)
  first_name: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Familiya kiritilishi kerak' })
  @MaxLength(80)
  last_name: string;

  @ApiProperty({ example: '+998901234567' })
  @Transform(phone)
  @Matches(PHONE_REGEX, { message: 'Telefon raqami noto‘g‘ri' })
  phone: string;

  @ApiProperty({ example: 3500000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  total_price: number;

  @ApiPropertyOptional({ description: 'O‘quvchi portali paroli (kamida 8 belgi, raqam bilan)' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MinLength(8, { message: 'Parol kamida 8 belgidan iborat bo‘lishi kerak' })
  @MaxLength(128)
  @Matches(/\d/, { message: 'Parolda kamida bitta raqam bo‘lishi kerak' })
  learner_password?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  idempotency_key?: string;
}

export class V2UpdateStudentDto extends V2StudentFieldsDto {
  @ApiPropertyOptional({ enum: COURSE_TYPES })
  @IsOptional()
  @IsIn(COURSE_TYPES, { message: 'Noto‘g‘ri kurs turi' })
  course_type?: (typeof COURSE_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Ism kiritilishi kerak' })
  @MaxLength(80)
  first_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Familiya kiritilishi kerak' })
  @MaxLength(80)
  last_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(phone)
  @Matches(PHONE_REGEX, { message: 'Telefon raqami noto‘g‘ri' })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  total_price?: number;

  @ApiPropertyOptional({ description: 'Qo‘shimcha to‘lov takrorlanmasligi uchun kalit' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  idempotency_key?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  learner_password?: string;
}

export class V2LearnerAccountDto {
  @ApiProperty({ description: 'Kamida 8 belgi, ichida raqam' })
  @IsString()
  @MinLength(8, { message: 'Parol kamida 8 belgidan iborat bo‘lishi kerak' })
  @MaxLength(128)
  @Matches(/\d/, { message: 'Parolda kamida bitta raqam bo‘lishi kerak' })
  password: string;
}
