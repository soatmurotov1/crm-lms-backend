import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';
import { trimString } from '../../../../common/dto/transform.util';

export class CreateHomeworkResponseDto {
  @ApiProperty({ example: 'string' })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'string' })
  @IsNumber()
  @Type(() => Number)
  homeworkId: number;
}
