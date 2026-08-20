import { ApiProperty } from '@nestjs/swagger';
import { Status } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { emptyToUndefined } from '../../../common/dto/transform.util';

export class CreatePlanDto {
  @ApiProperty({ example: 'Standart' })
  @IsString()
  name: string;

  @ApiProperty({ example: 500000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({ required: false, example: 1, description: 'Necha oyga' })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  durationMonth?: number;

  @ApiProperty({ required: false, example: 200 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  maxStudents?: number;

  @ApiProperty({ required: false, example: 20 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  maxTeachers?: number;

  @ApiProperty({ required: false, example: 30 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  maxGroups?: number;

  @ApiProperty({ required: false })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    required: false,
    type: [String],
    example: ['SMS xabarnoma', 'Hisobotlar'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @ApiProperty({ required: false, enum: Status })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsEnum(Status)
  status?: Status;
}
