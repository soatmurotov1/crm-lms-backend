import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateLessonDto {
  @ApiProperty({ example: 1 })
  @IsNumber()
  groupId: number;

  @ApiProperty({ example: 'string' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ example: '2026-04-03' })
  @IsOptional()
  @IsDateString()
  lessonDate?: string;
}
