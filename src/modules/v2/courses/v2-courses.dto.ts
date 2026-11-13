import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { emptyToUndefined, toIdString, trim } from '../common/v2-dto.util';
import type { V2CourseType } from '../common/v2.mapper';

const COURSE_TYPES = ['online', 'offline'];

export class V2CoursesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  branch_id?: string;

  @ApiPropertyOptional({ description: 'Faqat platforma egasi uchun' })
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
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class V2CreateCourseDto {
  @ApiProperty()
  @Transform(toIdString)
  @IsString()
  @IsNotEmpty({ message: 'Filialni tanlang' })
  branch_id: string;

  @ApiProperty({ enum: COURSE_TYPES, default: 'offline' })
  @IsIn(COURSE_TYPES, { message: 'Noto‘g‘ri kurs turi' })
  course_type: V2CourseType;

  @ApiProperty({ example: 60 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  duration_days: number;

  @ApiProperty({ example: 'Frontend dasturlash' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Kurs nomi kiritilishi kerak' })
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 3500000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Fan / kategoriya (LMS); null — olib tashlash',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(toIdString)
  @IsString()
  subject_id?: string | null;
}

export class V2UpdateCourseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toIdString)
  @IsString()
  branch_id?: string;

  @ApiPropertyOptional({ enum: COURSE_TYPES })
  @IsOptional()
  @IsIn(COURSE_TYPES, { message: 'Noto‘g‘ri kurs turi' })
  course_type?: V2CourseType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  duration_days?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Kurs nomi kiritilishi kerak' })
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Fan / kategoriya (LMS); null — olib tashlash',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(toIdString)
  @IsString()
  subject_id?: string | null;
}
