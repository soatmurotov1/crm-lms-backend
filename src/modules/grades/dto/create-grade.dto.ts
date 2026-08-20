import { ApiProperty } from '@nestjs/swagger';
import { GradeType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { emptyToUndefined } from '../../../common/dto/transform.util';

export class CreateGradeDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  studentId: number;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  groupId: number;

  @ApiProperty({ required: false })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  lessonId?: number;

  @ApiProperty({ required: false })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  examId?: number;

  @ApiProperty({ required: false, enum: GradeType })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsEnum(GradeType)
  type?: GradeType;

  @ApiProperty({ example: 85 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  score: number;

  @ApiProperty({ required: false, example: 100 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxScore?: number;

  @ApiProperty({ required: false })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiProperty({ required: false, example: '2026-07-29' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsDateString()
  date?: string;
}
