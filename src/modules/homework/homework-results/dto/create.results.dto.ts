import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsString, Max, Min } from 'class-validator';

export class CreateHomeworkResultsDto {
  @ApiProperty({ example: 'string' })
  @IsString()
  title: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Type(() => Number)
  homeworkId: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Type(() => Number)
  studentId: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  score: number;
}
