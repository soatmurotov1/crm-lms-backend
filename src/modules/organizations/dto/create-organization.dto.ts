import { ApiProperty } from '@nestjs/swagger';
import { Status } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import {
  normalizePhone,
  PHONE_FORMAT_MESSAGE,
  PHONE_REGEX,
} from 'src/common/utils/phone.util';
import { emptyToUndefined } from '../../../common/dto/transform.util';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Najot Talim' })
  @IsString()
  name: string;

  @ApiProperty({
    example: '+998901234567',
    description: 'Tashkilot admini shu raqam bilan tizimga kiradi',
  })
  @Transform(({ value }) =>
    value === undefined || value === null || String(value).trim() === ''
      ? undefined
      : normalizePhone(value),
  )
  @Matches(PHONE_REGEX, { message: PHONE_FORMAT_MESSAGE })
  phone: string;

  @ApiProperty({
    example: 'Parol123',
    description: 'Tashkilot admini hisobining paroli',
  })
  @Transform(emptyToUndefined)
  @IsString()
  @MinLength(6, { message: "Parol kamida 6 ta belgidan iborat bo'lishi kerak" })
  password: string;

  @ApiProperty({
    required: false,
    description: "Admin hisobining F.I.O.'si. Bo'sh bo'lsa rahbar ismi olinadi",
  })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  adminName?: string;

  @ApiProperty({ required: false })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ required: false })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  logo?: string;

  @ApiProperty({ required: false })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  directorName?: string;

  @ApiProperty({ required: false })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false, enum: Status })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsEnum(Status)
  status?: Status;
}
