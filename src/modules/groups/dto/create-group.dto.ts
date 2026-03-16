import { IsInt, IsString, IsEnum, IsArray, IsDateString } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { Status, WeekDays } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

const toWeekDaysArray = ({ value }: { value: unknown }) => {
  if (Array.isArray(value)) {
    return value
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      return value
    }
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch {
      }
    }

    if (trimmed.includes(',')) {
      return trimmed
        .split(',')
        .map((day) => day.trim())
        .filter(Boolean)
    }

    return [trimmed]
  }

  return value
}

export class CreateGroupDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Type(() => Number)
  teacherId: number

  @ApiProperty({ example: 1 })
  @IsInt()
  @Type(() => Number)
  roomId: number

  @ApiProperty({ example: 1 })
  @IsInt()
  @Type(() => Number)
  courseId: number

  @ApiProperty({ example: 'string' })
  @IsString()
  name: string

  @ApiProperty({ example: Status.ACTIVE })
  @IsEnum(Status)
  status: Status

  @ApiProperty({ example: new Date().toLocaleDateString() })
  @IsDateString()
  startDate: string

  @ApiProperty({ example: new Date().toLocaleTimeString() })
  @IsString()
  startTime: string
  
  @ApiProperty()
  @Transform(toWeekDaysArray)
  @IsArray()
  @IsEnum(WeekDays, { each: true })
  weekDays: WeekDays[];
}
