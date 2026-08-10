import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  normalizePhone,
  PHONE_FORMAT_MESSAGE,
  PHONE_REGEX,
} from 'src/common/utils/phone.util';
import { STAFF_ROLES } from 'src/common/utils/staff-roles.util';

export class UpdateUserDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiProperty({ required: false, example: '+998901234567' })
  @IsOptional()
  @Transform(({ value }) => normalizePhone(value))
  @Matches(PHONE_REGEX, { message: PHONE_FORMAT_MESSAGE })
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  position?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  address?: string;

  // Faqat xodim rollari — sababi `staff-roles.util.ts` da.
  @ApiProperty({ required: false, enum: STAFF_ROLES })
  @IsOptional()
  @IsIn(STAFF_ROLES, {
    message:
      "Rol faqat xodim roli bo'lishi mumkin (SUPERADMIN, ADMIN, MANAGEMENT, ADMINSTRATOR)",
  })
  role?: Role;
}
