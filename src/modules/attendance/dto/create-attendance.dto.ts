import { ApiProperty } from '@nestjs/swagger';
import { AttendanceStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

export class CreateAttendanceDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @IsNotEmpty()
  lessonId: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  @IsNotEmpty()
  studentId: number;

  @ApiProperty({
    required: false,
    example: true,
    description: 'Eski mijozlar uchun. status berilsa avtomatik hisoblanadi.',
  })
  @IsOptional()
  @IsBoolean()
  isPresent?: boolean;

  @ApiProperty({
    required: false,
    enum: AttendanceStatus,
    description: 'PRESENT / ABSENT / LATE (kechikdi) / EXCUSED (sababli)',
  })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;

  @ApiProperty({ required: false })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  comment?: string;
}
