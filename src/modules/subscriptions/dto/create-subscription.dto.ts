import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { emptyToUndefined } from '../../../common/dto/transform.util';

export class CreateSubscriptionDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  organizationId: number;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  planId: number;

  @ApiProperty({ required: false, example: '2026-08-01' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({
    required: false,
    example: '2026-09-01',
    description: 'Berilmasa tarif davomiyligidan hisoblanadi',
  })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({
    required: false,
    description: 'Berilmasa tarif narxi olinadi',
  })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiProperty({ required: false, enum: SubscriptionStatus })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @ApiProperty({ required: false })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  comment?: string;
}
