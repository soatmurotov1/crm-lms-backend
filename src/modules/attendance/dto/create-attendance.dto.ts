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
import { emptyToUndefined } from '../../../common/dto/transform.util';

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
