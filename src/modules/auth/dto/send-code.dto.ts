import { ApiProperty } from '@nestjs/swagger';
import { VerificationPurpose } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, Matches } from 'class-validator';
import {
  normalizePhone,
  PHONE_FORMAT_MESSAGE,
  PHONE_REGEX,
} from 'src/common/utils/phone.util';

export class SendCodeDto {
  @ApiProperty({ example: '+998901234567' })
  @Transform(({ value }) => normalizePhone(value))
  @Matches(PHONE_REGEX, { message: PHONE_FORMAT_MESSAGE })
  phone: string;

  @ApiProperty({
    enum: VerificationPurpose,
    required: false,
    default: VerificationPurpose.REGISTER,
    description:
      "REGISTER - ro'yxatdan o'tish, RESET_PASSWORD - parolni tiklash, CHANGE_PHONE - raqamni o'zgartirish",
  })
  @IsOptional()
  @IsEnum(VerificationPurpose)
  purpose?: VerificationPurpose;
}
