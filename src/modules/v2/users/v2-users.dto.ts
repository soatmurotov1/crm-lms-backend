import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PHONE_REGEX, normalizePhone } from 'src/common/utils/phone.util';
import { V2PageQueryDto } from '../common/v2-pagination';
import {
  emptyToUndefined,
  toBool,
  toIdString,
  trim,
} from '../common/v2-dto.util';
import type { V2Role } from '../common/v2.mapper';

export const ROLES = [
  'dev',
  'owner',
  'manager',
  'accountant',
  'operator',
  'teacher',
] as const;
const SPECIALIZATIONS = ['THEORY', 'PRACTICE'] as const;

const phone = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() ? normalizePhone(value) : undefined;
const email = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim()
    ? value.trim().toLowerCase()
    : undefined;

export class V2UsersQueryDto extends V2PageQueryDto {
  @ApiPropertyOptional({ enum: ROLES })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(ROLES)
  role?: V2Role;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  include_deleted?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  company_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  companyId?: string;
}

export class V2CreateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toIdString)
  @Transform(emptyToUndefined)
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ example: 'manager@autodrive.uz' })
  @IsOptional()
  @Transform(email)
  @IsEmail({}, { message: 'Email noto‘g‘ri' })
  email?: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Ism kiritilishi kerak' })
  @MaxLength(120)
  fullName: string;

  @ApiPropertyOptional({
    description: 'Kamida 8 belgi, ichida raqam va bosh harf bo‘lishi kerak',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MinLength(8, { message: 'Parol kamida 8 belgidan iborat bo‘lishi kerak' })
  @MaxLength(128)
  @Matches(/\d/, { message: 'Parolda kamida bitta raqam bo‘lishi kerak' })
  @Matches(/[A-Z]/, { message: 'Parolda kamida bitta bosh harf bo‘lishi kerak' })
  password?: string;

  @ApiPropertyOptional({ example: '+998901234567' })
  @IsOptional()
  @Transform(phone)
  @Matches(PHONE_REGEX, { message: 'Telefon raqami noto‘g‘ri' })
  phone?: string;

  @ApiProperty({ enum: ROLES })
  @IsIn(ROLES, { message: 'Rol noto‘g‘ri' })
  role: V2Role;

  @ApiPropertyOptional({ enum: SPECIALIZATIONS })
  @IsOptional()
  @IsIn(SPECIALIZATIONS)
  specialization?: (typeof SPECIALIZATIONS)[number];
}

export class V2UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toIdString)
  @IsString()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Ism kiritilishi kerak' })
  @MaxLength(120)
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(phone)
  @Matches(PHONE_REGEX, { message: 'Telefon raqami noto‘g‘ri' })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(email)
  @IsEmail({}, { message: 'Email noto‘g‘ri' })
  email?: string;

  @ApiPropertyOptional({ enum: SPECIALIZATIONS })
  @IsOptional()
  @IsIn(SPECIALIZATIONS)
  specialization?: (typeof SPECIALIZATIONS)[number];
}

class V2BranchMembershipDto {
  @ApiProperty()
  @Transform(toIdString)
  @IsString()
  branchId: string;

  @ApiProperty()
  @IsBoolean()
  active: boolean;
}

class V2AccessScopeDto {
  @ApiProperty({ enum: ['company', 'branch', 'own'] })
  @IsIn(['company', 'branch', 'own'])
  scope: 'company' | 'branch' | 'own';

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toIdString)
  @IsString()
  branchId?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  permissions: string[];
}

export class V2UpdateAccessDto {
  @ApiProperty({ description: 'Joriy `access_version` (optimistik qulf)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version: number;

  @ApiPropertyOptional({ type: [V2BranchMembershipDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => V2BranchMembershipDto)
  branches?: V2BranchMembershipDto[];

  @ApiProperty({ type: [V2AccessScopeDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => V2AccessScopeDto)
  scopes: V2AccessScopeDto[];
}

export class V2PermissionTemplateDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Shablon nomi kiritilishi kerak' })
  @MaxLength(80)
  name: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  permissions: string[];
}

export class V2WriteOptionsQueryDto {
  @ApiProperty({ example: 'students' })
  @IsString()
  @MaxLength(64)
  resource: string;

  @ApiProperty({ enum: ['create', 'update'] })
  @IsIn(['create', 'update'])
  action: 'create' | 'update';

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: ['tezkor', 'avto_maktab'] })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(['tezkor', 'avto_maktab'])
  course_type?: 'tezkor' | 'avto_maktab';

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
