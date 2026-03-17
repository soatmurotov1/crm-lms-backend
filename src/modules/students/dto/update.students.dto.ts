import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString } from 'class-validator';
import { UserStatus } from '@prisma/client';

const emptyToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

export class UpdateStudentDto {
  @ApiProperty({ required: false })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiProperty({ required: false })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsEmail()
  email?: string;

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
