import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class LearnerLoginDto {
  @ApiProperty({ example: '+998901234567' })
  @Transform(trim)
  @IsString()
  @MinLength(7, { message: 'Telefon raqam noto‘g‘ri' })
  @MaxLength(32)
  phone: string;

  @ApiProperty()
  @IsString()
  @MaxLength(128)
  password: string;
}

export class LearnerChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MaxLength(128)
  currentPassword: string;

  @ApiProperty({ description: 'Kamida 8 belgi, ichida raqam bo‘lsin' })
  @IsString()
  @MinLength(8, { message: 'Parol kamida 8 belgidan iborat bo‘lishi kerak' })
  @MaxLength(128)
  @Matches(/\d/, { message: 'Parolda kamida bitta raqam bo‘lishi kerak' })
  newPassword: string;
}

export class LearnerSubmitAssignmentDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Javob bo‘sh bo‘lmasin' })
  @MaxLength(10_000)
  text: string;
}

export class LearnerQuizAttemptDto {
  @ApiProperty({
    description: 'Savol id → javob (indeks, indekslar ro‘yxati yoki matn)',
  })
  @IsObject()
  answers: Record<string, number | number[] | string>;
}

export class LearnerScheduleQueryDto {
  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date_from?: string;

  @ApiPropertyOptional({ example: '2026-11-30' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date_to?: string;
}

export class UpdateLearnerPortalDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() schedule?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() courses?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() assignments?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() quizzes?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() grades?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() attendance?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() payments?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() notifications?: boolean;
}
