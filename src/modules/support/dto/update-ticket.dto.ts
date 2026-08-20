import { ApiProperty } from '@nestjs/swagger';
import { SupportPriority, SupportStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional } from 'class-validator';
import { emptyToUndefined } from '../../../common/dto/transform.util';

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
