import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { trimString } from 'src/common/dto/transform.util';

/** Bo'sh matn — "emailni olib tashla": `null` bo'lib saqlanadi. */
const normalizeEmail = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;

  const trimmed = value.trim().toLowerCase();
  return trimmed === '' ? null : trimmed;
};

export class UpdateMeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(2, { message: "Ism kamida 2 ta belgidan iborat bo'lishi kerak" })
  @MaxLength(120)
  fullName?: string;

  @ApiPropertyOptional({ nullable: true, example: 'admin@example.com' })
  @Transform(normalizeEmail)
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsEmail({}, { message: "Email noto'g'ri formatda" })
  @MaxLength(254)
  email?: string | null;
}
