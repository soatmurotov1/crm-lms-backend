import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length, Matches, MinLength } from 'class-validator';
import {
  normalizePhone,
  PHONE_FORMAT_MESSAGE,
  PHONE_REGEX,
} from 'src/common/utils/phone.util';

/**
 * SMS kod tasdiqlangandan keyin foydalanuvchi o'zi parol qo'yadi.
 * `POST /auth/set-password` (ro'yxatdan o'tish) va
 * `POST /auth/reset-password` (parolni tiklash) uchun bir xil shakl.
 */
export class SetPasswordDto {
  @ApiProperty({ example: '+998901234567' })
  @Transform(({ value }) => normalizePhone(value))
  @Matches(PHONE_REGEX, { message: PHONE_FORMAT_MESSAGE })
  phone: string;

  @ApiProperty({ example: '917810' })
  @Transform(({ value }) => String(value ?? '').trim())
  @Length(6, 6, { message: "Tasdiqlash kodi 6 xonali bo'lishi kerak" })
  code: string;

  @ApiProperty({ example: 'yangiParol123' })
  @IsString()
  @MinLength(6, { message: "Parol kamida 6 belgidan iborat bo'lishi kerak" })
  password: string;
}
