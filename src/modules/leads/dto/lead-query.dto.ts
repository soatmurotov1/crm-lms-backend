import { ApiPropertyOptional } from '@nestjs/swagger';
import { LeadStage } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dto/pagination.dto';
import { emptyToUndefined } from 'src/common/dto/transform.util';

const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return value;
};

export class LeadQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: LeadStage })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsEnum(LeadStage, { message: "Noto'g'ri bosqich" })
  stage?: LeadStage;

  @ApiPropertyOptional({ description: 'Ism yoki telefon bo‘yicha qidiruv' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Faqat menga biriktirilgan lidlar' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  mine?: boolean;

  @ApiPropertyOptional({ description: 'Bog‘lanish vaqti o‘tib ketgan lidlar' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  overdue?: boolean;
}
