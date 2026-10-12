import { ApiProperty, PartialType } from '@nestjs/swagger';
import { LeadStage } from '@prisma/client';
import { IsEnum } from 'class-validator';
import { CreateLeadDto } from './create-lead.dto';

export class UpdateLeadDto extends PartialType(CreateLeadDto) {}

/** Doskada kartani boshqa ustunga ko'chirish. */
export class UpdateLeadStageDto {
  @ApiProperty({ enum: LeadStage })
  @IsEnum(LeadStage, { message: "Noto'g'ri bosqich" })
  stage: LeadStage;
}
