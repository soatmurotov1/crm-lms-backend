import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsString,
  IsEnum,
  IsArray,
  IsDateString,
  IsOptional,
} from 'class-validator';
import { Status, WeekDays } from '@prisma/client';
import {
  emptyToUndefined,
  toWeekDaysArray,
} from '../../../common/dto/transform.util';

export class UpdateGroupDto {
  @ApiProperty({ example: 1 })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  teacherId?: number;

  @ApiProperty({ example: 1 })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  roomId?: number;

  @ApiProperty({ example: 1 })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  courseId?: number;

  @ApiProperty({ example: 'string' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  name?: string;

  @ApiProperty({ example: Status.ACTIVE, enum: Status })
  @IsOptional()
  @IsEnum(Status)
  status?: Status;

  @ApiProperty({ example: new Date().toLocaleDateString() })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ example: new Date().toLocaleTimeString() })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  startTime?: string;

  @ApiProperty({ example: [WeekDays.MONDAY, WeekDays.WEDNESDAY] })
  @IsOptional()
  @Transform(toWeekDaysArray)
  @IsArray()
  @IsEnum(WeekDays, { each: true })
  weekDays?: WeekDays[];
}
