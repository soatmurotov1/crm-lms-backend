import { IsString, IsEmail, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class CreateStudentDto {
  @ApiProperty()
  @IsString()
  fullName: string

  @ApiProperty()
  @IsEmail()
  email: string

  @ApiProperty()
  @IsString()
  password: string

  @ApiProperty()
  @IsString()
  birth_date: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  photo?: string;
}
