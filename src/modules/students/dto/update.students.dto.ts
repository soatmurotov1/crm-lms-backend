import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches } from 'class-validator';
import { UserStatus } from '@prisma/client';
import {
  normalizePhone,
  PHONE_FORMAT_MESSAGE,
  PHONE_REGEX,
} from 'src/common/utils/phone.util';
import { emptyToUndefined } from '../../../common/dto/transform.util';

export class UpdateStudentDto {
  @ApiProperty({ required: false })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiProperty({ required: false, example: '+998901234567' })
  @Transform(({ value }) =>
    value === undefined || value === null || String(value).trim() === ''
      ? undefined
      : normalizePhone(value),
  )
  @IsOptional()
  @Matches(PHONE_REGEX, { message: PHONE_FORMAT_MESSAGE })
  phone?: string;

  @ApiProperty({ required: false })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  password?: string;

  @ApiProperty({ required: false })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  birth_date?: string;

  @ApiProperty({ required: false })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  photo?: string;

  @ApiProperty({ required: false, enum: UserStatus })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  status?: UserStatus;
}
