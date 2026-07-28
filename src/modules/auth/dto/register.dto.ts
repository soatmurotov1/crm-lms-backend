import { IsString, Length, Matches, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  normalizePhone,
  PHONE_FORMAT_MESSAGE,
  PHONE_REGEX,
} from 'src/common/utils/phone.util';

/**
 * Ochiq ro'yxatdan o'tish. Bu yo'l bilan kelgan foydalanuvchi doim STUDENT
 * bo'ladi - rolni tashqaridan berib bo'lmaydi.
 *
 * Raqam egasi ekanini isbotlash uchun avval `POST /auth/send-code` chaqirilib,
 * SMS kod olinadi va shu yerda `code` sifatida yuboriladi.
 */
export class RegisterDto {
  @ApiProperty({ example: 'Aliyev Ali Valiyevich' })
  @IsString()
  @MinLength(3, { message: 'FIO kamida 3 ta belgidan iborat bo\'lsin' })
  fullName: string;

  @ApiProperty({ example: '+998901234567' })
  @Transform(({ value }) => normalizePhone(value))
  @Matches(PHONE_REGEX, { message: PHONE_FORMAT_MESSAGE })
  phone: string;

  @ApiProperty({ example: '2005-04-12' })
  @IsString()
  birth_date: string;

  @ApiProperty({ example: 'parol123' })
  @IsString()
  @MinLength(6, { message: 'Parol kamida 6 ta belgidan iborat bo\'lsin' })
  password: string;

  @ApiProperty({ example: '917810', description: 'SMS orqali kelgan 6 xonali kod' })
  @Transform(({ value }) => String(value ?? '').trim())
  @Length(6, 6, { message: "Tasdiqlash kodi 6 xonali bo'lishi kerak" })
  code: string;
}
