import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsString } from 'class-validator';

export class CreateHomeworkResponseDto {
  @ApiProperty({ example: 'string' })
  @IsString()
  title: string

  @ApiProperty({ example: "string"})
  @IsNumber()
  @Type(() => Number)
  homeworkId: number    
}
