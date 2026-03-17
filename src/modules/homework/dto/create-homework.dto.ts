import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';
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

  @ApiProperty({ example: 16, required: false })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  durationTime?: number
}
