import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Matches } from 'class-validator';
import {
  normalizePhone,
  PHONE_FORMAT_MESSAGE,
  PHONE_REGEX,
} from 'src/common/utils/phone.util';

export class CreateTeacherDto {
  @ApiProperty()
  @IsString()
  fullName: string;

  @ApiProperty({ example: '+998901234567' })
  @Transform(({ value }) => normalizePhone(value))
  @Matches(PHONE_REGEX, { message: PHONE_FORMAT_MESSAGE })
  phone: string;

  @ApiProperty()
  @IsString()
  password: string;

  @ApiProperty()
  @IsString()
  position: string;

  @ApiProperty()
  @IsNumber()
  @Type(() => Number)
  experience: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  photo?: string;
}
