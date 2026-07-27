import { ApiProperty } from '@nestjs/swagger';
import { VerificationPurpose } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, Length, Matches } from 'class-validator';
import {
  normalizePhone,
  PHONE_FORMAT_MESSAGE,
  PHONE_REGEX,
} from 'src/common/utils/phone.util';

export class VerifyCodeDto {
  @ApiProperty({ example: '+998901234567' })
  @Transform(({ value }) => normalizePhone(value))
  @Matches(PHONE_REGEX, { message: PHONE_FORMAT_MESSAGE })
  phone: string;

  @ApiProperty({ example: '917810' })
  @Transform(({ value }) => String(value ?? '').trim())
  @Length(6, 6, { message: "Tasdiqlash kodi 6 xonali bo'lishi kerak" })
  code: string;

  @ApiProperty({
    enum: VerificationPurpose,
    required: false,
    default: VerificationPurpose.REGISTER,
  })
  @IsOptional()
  @IsEnum(VerificationPurpose)
  purpose?: VerificationPurpose;
}
