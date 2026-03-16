import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsDateString, IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'string' })
  @IsString()
  fullName: string

  @ApiProperty({ example: 'string' })
  @IsString()
  @IsEmail()
  email: string

  @ApiProperty({ example: 'string' })
  @IsString()
  password: string;

  @ApiProperty({ example: 'string' })
  @IsString()
  position: string;

  @ApiProperty({ example: 'string' })
  @IsDateString()
  hire_date: string;

  @ApiProperty({ example: Role.STUDENT })
  @IsString()
  @IsEnum(Role)
  role: Role

  @ApiProperty({ example: 'string' })
  @IsOptional()
  @IsString()
  address?: string
}
