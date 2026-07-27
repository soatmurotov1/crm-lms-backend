import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { Length, Matches } from 'class-validator';
import {
  normalizePhone,
  PHONE_FORMAT_MESSAGE,
  PHONE_REGEX,
} from 'src/common/utils/phone.util';

export class RequestPhoneChangeDto {
  @ApiProperty({ example: '+998907654321', description: 'Yangi telefon raqami' })
  @Transform(({ value }) => normalizePhone(value))
  @Matches(PHONE_REGEX, { message: PHONE_FORMAT_MESSAGE })
  newPhone: string;
}

export class ConfirmPhoneChangeDto {
  @ApiProperty({ example: '+998907654321', description: 'Yangi telefon raqami' })
  @Transform(({ value }) => normalizePhone(value))
  @Matches(PHONE_REGEX, { message: PHONE_FORMAT_MESSAGE })
  newPhone: string;

  @ApiProperty({ example: '132044' })
  @Transform(({ value }) => String(value ?? '').trim())
  @Length(6, 6, { message: "Tasdiqlash kodi 6 xonali bo'lishi kerak" })
  code: string;
}
