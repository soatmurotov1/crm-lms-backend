import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  emptyToNull,
  emptyToUndefined,
  toBool,
  toIdString,
  trim,
} from '../common/v2-dto.util';
import type { V2CourseType } from '../common/v2.mapper';

const COURSE_TYPES = ['tezkor', 'avto_maktab'];

export class V2GroupsQueryDto {
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
  branch_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  company_id?: string;

  @ApiPropertyOptional({ enum: COURSE_TYPES })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(COURSE_TYPES)
  course_type?: V2CourseType;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  include_deleted?: boolean;
}

export class V2GroupsOverviewQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  company_id?: string;
}

export class V2CreateGroupDto {
  @ApiProperty()
  @Transform(toIdString)
  @IsString()
  @IsNotEmpty({ message: 'Filialni tanlang' })
  branchId: string;

  @ApiProperty({ enum: COURSE_TYPES, default: 'avto_maktab' })
  @IsIn(COURSE_TYPES, { message: 'Noto‘g‘ri kurs turi' })
  courseType: V2CourseType;

  @ApiProperty({ example: '11-guruh' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Guruh nomi kiritilishi kerak' })
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ description: 'O‘qituvchi (`t12`); null — biriktirilmagan' })
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, value) => value !== null)
  @IsString()
  teacherId?: string | null;
}

export class V2UpdateGroupDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toIdString)
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ enum: COURSE_TYPES })
  @IsOptional()
  @IsIn(COURSE_TYPES, { message: 'Noto‘g‘ri kurs turi' })
  courseType?: V2CourseType;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Guruh nomi kiritilishi kerak' })
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ description: 'O‘qituvchi (`t12`); null — olib tashlash' })
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, value) => value !== null)
  @IsString()
  teacherId?: string | null;
}
