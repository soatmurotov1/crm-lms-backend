import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';
import { Role } from '@prisma/client';
import { IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';
import {
  normalizePhone,
  PHONE_FORMAT_MESSAGE,
  PHONE_REGEX,
} from 'src/common/utils/phone.util';

export class UpdateUserDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiProperty({ required: false, example: '+998901234567' })
  @IsOptional()
  @Transform(({ value }) => normalizePhone(value))
  @Matches(PHONE_REGEX, { message: PHONE_FORMAT_MESSAGE })
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  position?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ required: false, enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
