import { ApiProperty } from '@nestjs/swagger';
import { Status } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import {
  normalizePhone,
  PHONE_FORMAT_MESSAGE,
  PHONE_REGEX,
} from 'src/common/utils/phone.util';

const emptyToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Najot Talim' })
  @IsString()
  name: string;

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
