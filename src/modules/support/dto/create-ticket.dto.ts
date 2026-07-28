import { ApiProperty } from '@nestjs/swagger';
import { SupportPriority } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

export class CreateTicketDto {
  @ApiProperty({ example: 'To‘lov qabul qilinmayapti' })
  @IsString()
  subject: string;

  @ApiProperty({ example: 'Payme orqali to‘lov o‘tmayapti.' })
  @IsString()
  message: string;

  @ApiProperty({ required: false, enum: SupportPriority })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsEnum(SupportPriority)
  priority?: SupportPriority;

  @ApiProperty({ required: false })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiProperty({ required: false })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  organizationId?: number;
}
