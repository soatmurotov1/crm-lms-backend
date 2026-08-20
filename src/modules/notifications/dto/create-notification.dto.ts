import { ApiProperty } from '@nestjs/swagger';
import { NotificationAudience, NotificationType, Role } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { emptyToUndefined } from '../../../common/dto/transform.util';

export class CreateNotificationDto {
  @ApiProperty({ example: "To'lov eslatmasi" })
  @IsString()
  title: string;

  @ApiProperty({ example: 'Iltimos, oylik to‘lovni amalga oshiring.' })
  @IsString()
  message: string;

  @ApiProperty({ required: false, enum: NotificationType })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @ApiProperty({ required: false, enum: NotificationAudience })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsEnum(NotificationAudience)
  audience?: NotificationAudience;

  @ApiProperty({ required: false, description: 'audience=GROUP bo‘lsa' })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  groupId?: number;

  @ApiProperty({ required: false, description: 'audience=ORGANIZATION bo‘lsa' })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  organizationId?: number;

  @ApiProperty({
    required: false,
    enum: Role,
    description: 'audience=USER bo‘lsa — qabul qiluvchining roli',
  })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsEnum(Role)
  recipientRole?: Role;

  @ApiProperty({
    required: false,
    description: 'audience=USER bo‘lsa — qabul qiluvchining id raqami',
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  recipientId?: number;
}
