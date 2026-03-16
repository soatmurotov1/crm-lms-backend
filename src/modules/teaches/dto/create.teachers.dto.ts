import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateTeacherDto {
  @ApiProperty()
  @IsString()
  fullName: string

  @ApiProperty()
  @IsString()
  email: string

  @ApiProperty()
  @IsString()
  password: string

  @ApiProperty()
  @IsString()
  position: string

  @ApiProperty()
  @IsNumber()
  @Type(() => Number)
  experience: number

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  photo?: string
}
