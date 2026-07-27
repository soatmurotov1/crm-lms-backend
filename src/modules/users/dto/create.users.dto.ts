import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import {
  normalizePhone,
  PHONE_FORMAT_MESSAGE,
  PHONE_REGEX,
} from 'src/common/utils/phone.util';

export class CreateUserDto {
  @ApiProperty({ example: 'string' })
  @IsString()
  fullName: string;

  @ApiProperty({ example: '+998901234567' })
  @Transform(({ value }) => normalizePhone(value))
  @Matches(PHONE_REGEX, { message: PHONE_FORMAT_MESSAGE })
  phone: string;

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
  role: Role;

  @ApiProperty({ example: 'string' })
  @IsOptional()
  @IsString()
  address?: string;
}
