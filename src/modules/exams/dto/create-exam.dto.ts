import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateExamDto {
  @ApiProperty({ example: 'Yakuniy imtihon' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  groupId: number;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  lessonId: number;

  @ApiProperty({ example: '2026-08-01T09:00:00.000Z' })
  @IsDateString()
  @IsNotEmpty()
  startAt: string;

  @ApiProperty({ example: '2026-08-01T11:00:00.000Z' })
  @IsDateString()
  @IsNotEmpty()
  endAt: string;

  @ApiProperty({ example: 'Imtihon haqida izoh', required: false })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 60, required: false })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  durationTime?: number;

  @ApiProperty({ example: 100, required: false })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  maxScore?: number;
}
