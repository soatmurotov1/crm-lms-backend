import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';
import {
  normalizePhone,
  PHONE_FORMAT_MESSAGE,
  PHONE_REGEX,
} from 'src/common/utils/phone.util';

export class LoginDto {
  @ApiProperty({ example: '+998901234567' })
  @Transform(({ value }) => normalizePhone(value))
  @Matches(PHONE_REGEX, { message: PHONE_FORMAT_MESSAGE })
  phone: string;

  @ApiProperty({ example: 'string' })
  @IsString()
  password: string;
}
