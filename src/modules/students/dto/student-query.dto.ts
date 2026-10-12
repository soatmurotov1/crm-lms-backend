import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dto/pagination.dto';
import { emptyToUndefined } from 'src/common/dto/transform.util';

export class StudentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Ism yoki telefon bo‘yicha qidiruv' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(100)
  search?: string;
}
