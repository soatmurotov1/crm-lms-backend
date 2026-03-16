import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsBoolean, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateAttendanceDto {
  @ApiProperty({ example: 1})
  @IsInt()
  @IsNotEmpty()
  lessonId: number

  @ApiProperty({ example: 1})
  @IsInt()
  @IsNotEmpty()
  studentId: number

  @ApiProperty({ example: true})
  @IsBoolean()
  @IsNotEmpty()
  isPresent: boolean
}