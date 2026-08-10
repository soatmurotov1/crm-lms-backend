import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import {
  normalizePhone,
  PHONE_FORMAT_MESSAGE,
  PHONE_REGEX,
} from 'src/common/utils/phone.util';
import { STAFF_ROLES } from 'src/common/utils/staff-roles.util';

export class CreateUserDto {
  @ApiProperty({ example: 'string' })
  @IsString()
  fullName: string;

  @ApiProperty({ example: '+998901234567' })
  @Transform(({ value }) => normalizePhone(value))
  @Matches(PHONE_REGEX, { message: PHONE_FORMAT_MESSAGE })
  phone: string;

  @ApiProperty({ example: 'string' })
  @IsString()
  password: string;

  @ApiProperty({ example: 'string' })
  @IsString()
  position: string;

  @ApiProperty({ example: 'string' })
  @IsDateString()
  hire_date: string;

  /*
    Rol ixtiyoriy: xodim qo'shish formasida u tanlanmaydi, servis ADMIN qo'yadi.

    Ro'yxat butun `Role` enum'i emas, faqat xodim rollari: o'qituvchi va
    o'quvchi boshqa jadvallarda yashaydi va ID hisoblagichi ham alohida.
    TEACHER roli berilgan `User` yozuvi begona o'qituvchining ID si sifatida
    ishlatilib ketardi.
  */
  @ApiProperty({ required: false, enum: STAFF_ROLES, example: Role.ADMIN })
  @IsOptional()
  @IsString()
  @IsIn(STAFF_ROLES, {
    message:
      "Rol faqat xodim roli bo'lishi mumkin (SUPERADMIN, ADMIN, MANAGEMENT, ADMINSTRATOR)",
  })
  role?: Role;

  @ApiProperty({ example: 'string' })
  @IsOptional()
  @IsString()
  address?: string;
}
