import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber } from 'class-validator';
import { Type } from 'class-transformer'

export class CreateLessonVideosDto {
  @ApiProperty({ example: 1 })
  @IsNumber()
  @Type(() => Number)
  groupId: number

  @ApiProperty({ example: 1 })
  @IsNumber()
  @IsNotEmpty()
  @Type(() => Number)
  lessonId: number
}
