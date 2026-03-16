import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber } from 'class-validator';
import { Type } from 'class-transformer'

export class CreateHomeworkDto {
  @ApiProperty({ example: "stringh"})
  @IsString()
  @IsNotEmpty()
  title: string

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  groupId: number

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  lessonId: number
}
