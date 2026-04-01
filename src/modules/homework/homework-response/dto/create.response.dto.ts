import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreateHomeworkResponseDto {
  @ApiProperty({ example: 'string' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'string' })
  @IsNumber()
  @Type(() => Number)
  homeworkId: number;
}
