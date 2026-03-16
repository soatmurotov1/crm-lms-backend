import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateLessonDto {
  @ApiPropertyOptional({ example: 'string' })
  @IsOptional()
  @IsString()
  title?: string
}
