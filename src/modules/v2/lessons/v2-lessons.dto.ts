import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { V2PageQueryDto } from '../common/v2-pagination';
import {
  DATE_ONLY,
  TIME_HM,
  emptyToUndefined,
  toIdString,
  trim,
} from '../common/v2-dto.util';

export const LESSON_TYPES = ['theory', 'practice'] as const;
export const ATTENDANCE_STATUSES = [
  'present',
  'absent',
  'late',
  'excused',
] as const;

export class V2LessonsQueryDto extends V2PageQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class V2CreateLessonDto {
  @ApiProperty({ example: '2026-06-22T09:00:00Z' })
  @IsDateString({}, { message: 'Dars vaqti noto‘g‘ri' })
  date: string;

  @ApiProperty()
  @Transform(toIdString)
  @IsString()
  @IsNotEmpty({ message: 'Guruhni tanlang' })
  groupId: string;

  @ApiProperty({ enum: LESSON_TYPES })
  @IsIn(LESSON_TYPES, { message: 'Dars turi noto‘g‘ri' })
  lessonType: (typeof LESSON_TYPES)[number];

  @ApiProperty({ example: '1-dars teoriya' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Dars nomi kiritilishi kerak' })
  @MaxLength(200)
  title: string;
}

export class V2UpdateLessonDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString({}, { message: 'Dars vaqti noto‘g‘ri' })
  date?: string;

  @ApiPropertyOptional({ enum: LESSON_TYPES })
  @IsOptional()
  @IsIn(LESSON_TYPES, { message: 'Dars turi noto‘g‘ri' })
  lessonType?: (typeof LESSON_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Dars nomi kiritilishi kerak' })
  @MaxLength(200)
  title?: string;
}

export class V2AttendanceRecordDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toIdString)
  @IsString()
  lessonId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiProperty({ enum: ATTENDANCE_STATUSES })
  @IsIn(ATTENDANCE_STATUSES, { message: 'Davomat holati noto‘g‘ri' })
  status: (typeof ATTENDANCE_STATUSES)[number];

  @ApiProperty()
  @Transform(toIdString)
  @IsString()
  @IsNotEmpty()
  studentId: string;
}

export class V2BatchAttendanceDto {
  @ApiProperty()
  @Transform(toIdString)
  @IsString()
  @IsNotEmpty()
  lessonId: string;

  @ApiProperty({ type: [V2AttendanceRecordDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => V2AttendanceRecordDto)
  records: V2AttendanceRecordDto[];
}

export class V2AttendanceHistoryQueryDto {
  @ApiProperty()
  @Transform(toIdString)
  @IsString()
  @IsNotEmpty()
  student_id: string;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class V2CalendarQueryDto {
  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value ? value.slice(0, 10) : undefined,
  )
  @Matches(DATE_ONLY)
  date_from?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value ? value.slice(0, 10) : undefined,
  )
  @Matches(DATE_ONLY)
  date_to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  company_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  branch_id?: string;
}

export class V2CreateTemplateDto {
  @ApiProperty({ description: '1 = Dushanba ... 7 = Yakshanba', example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek: number;

  @ApiProperty({ example: '11:00' })
  @Matches(TIME_HM, { message: 'Vaqt HH:mm ko‘rinishida bo‘lishi kerak' })
  endTime: string;

  @ApiProperty()
  @Transform(toIdString)
  @IsString()
  @IsNotEmpty({ message: 'Guruhni tanlang' })
  groupId: string;

  @ApiProperty({ enum: LESSON_TYPES })
  @IsIn(LESSON_TYPES, { message: 'Dars turi noto‘g‘ri' })
  lessonType: (typeof LESSON_TYPES)[number];

  @ApiProperty({ example: '09:00' })
  @Matches(TIME_HM, { message: 'Vaqt HH:mm ko‘rinishida bo‘lishi kerak' })
  startTime: string;
}

export class V2UpdateTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(TIME_HM, { message: 'Vaqt HH:mm ko‘rinishida bo‘lishi kerak' })
  endTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toIdString)
  @IsString()
  groupId?: string;

  @ApiPropertyOptional({ enum: LESSON_TYPES })
  @IsOptional()
  @IsIn(LESSON_TYPES, { message: 'Dars turi noto‘g‘ri' })
  lessonType?: (typeof LESSON_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(TIME_HM, { message: 'Vaqt HH:mm ko‘rinishida bo‘lishi kerak' })
  startTime?: string;
}

export class V2GenerateLessonsDto {
  @ApiPropertyOptional({ description: 'Bo‘sh bo‘lsa — barcha guruhlar' })
  @IsOptional()
  @Transform(toIdString)
  @Transform(emptyToUndefined)
  @IsString()
  groupId?: string;

  @ApiProperty({ example: 4, description: 'Necha haftaga dars yaratish' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(26)
  weeks: number;
}
