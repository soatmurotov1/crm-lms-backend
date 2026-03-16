import {  IsString,  IsNotEmpty,  IsNumber,  IsEnum,  IsOptional, Min } from 'class-validator';
import { Status, CourseLevel } from '@prisma/client'
import { ApiProperty } from '@nestjs/swagger';

export class CreateCourseDto {
  @ApiProperty({ example: "string"})
  @IsString()
  @IsNotEmpty()
  name: string

  @ApiProperty({ example: 1})
  @IsNumber()
  @Min(1)
  durationMonth: number

  @ApiProperty({ example: 1})
  @IsNumber()
  @Min(1)
  durationLesson: number

  @ApiProperty({ enum: Status, example: Status.ACTIVE})
  @IsEnum(Status)
  @IsOptional()
  status?: Status

  @ApiProperty({ enum: CourseLevel, example: CourseLevel.BEGINNER})
  @IsEnum(CourseLevel)
  @IsOptional()
  level?: CourseLevel

  @ApiProperty({ example: 1})
  @IsNumber() 
  @Min(0)
  price: number

  @ApiProperty({ example: "string"})
  @IsString()
  @IsOptional()
  description?: string
}