import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ExpenseStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  emptyToUndefined,
  trimString,
} from 'src/common/dto/transform.util';

export class CreateExpenseDto {
  @ApiProperty()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'Xarajat nomi kiritilishi kerak' })
  @MaxLength(160)
  title: string;

  @ApiProperty({ example: 'Ijara' })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'Toifa kiritilishi kerak' })
  @MaxLength(80)
  category: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber({}, { message: "Summa son bo'lishi kerak" })
  @IsPositive({ message: "Summa 0 dan katta bo'lishi kerak" })
  amount: number;

  @ApiPropertyOptional({ enum: ExpenseStatus })
  @IsOptional()
  @IsEnum(ExpenseStatus, { message: "Noto'g'ri holat" })
  status?: ExpenseStatus;

  @ApiPropertyOptional({ description: 'To‘lash muddati (ISO)' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsDateString({}, { message: "Sana noto'g'ri formatda" })
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class UpdateExpenseDto extends PartialType(CreateExpenseDto) {}
