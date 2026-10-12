import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeadStage } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  emptyToUndefined,
  trimString,
} from 'src/common/dto/transform.util';

export class CreateLeadDto {
  @ApiProperty()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'Ism kiritilishi kerak' })
  @MaxLength(120)
  fullName: string;

  @ApiProperty()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'Telefon kiritilishi kerak' })
  @MaxLength(32)
  phone: string;

  @ApiPropertyOptional({ description: 'Lid qayerdan kelgani (Instagram, tavsiya…)' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(80)
  source?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({ enum: LeadStage })
  @IsOptional()
  @IsEnum(LeadStage, { message: "Noto'g'ri bosqich" })
  stage?: LeadStage;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  courseId?: number;

  @ApiPropertyOptional({ description: 'Mas’ul xodim (User) id' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  assignedToId?: number;

  @ApiPropertyOptional({ description: 'Keyingi bog‘lanish vaqti (ISO)' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsDateString({}, { message: "Sana noto'g'ri formatda" })
  nextContactAt?: string;
}
