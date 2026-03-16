import { ApiProperty } from '@nestjs/swagger';
import { HomeworkStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsString } from 'class-validator';

export class HomeworkStatusDto {
  @ApiProperty({ example: 'string' })
  @IsString()
  @Type(() => String)
  @IsEnum(HomeworkStatus)
  status: HomeworkStatus
}
