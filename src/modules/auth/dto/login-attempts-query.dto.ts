import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class LoginAttemptsQueryDto {
  @ApiPropertyOptional({ description: "Faqat shu telefon raqami bo'yicha" })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    description: 'Faqat muvaffaqiyatsiz urinishlar',
    default: false,
  })
  @IsOptional()
  // Query string'da qiymat doim matn: "true" ni boolean'ga o'giramiz.
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  onlyFailed?: boolean;

  @ApiPropertyOptional({ description: 'Nechta yozuv (1-200)', default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
