import { ApiProperty } from '@nestjs/swagger';
import { SupportPriority, SupportStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional } from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

export class UpdateTicketDto {
  @ApiProperty({ required: false, enum: SupportStatus })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsEnum(SupportStatus)
  status?: SupportStatus;

  @ApiProperty({ required: false, enum: SupportPriority })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsEnum(SupportPriority)
  priority?: SupportPriority;
}
