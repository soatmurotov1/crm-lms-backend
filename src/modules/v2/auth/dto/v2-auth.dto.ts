import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class V2LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Email noto‘g‘ri' })
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MaxLength(128)
  password: string;
}

export class V2ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MaxLength(128)
  currentPassword: string;

  @ApiProperty({
    description: 'Kamida 8 belgi, ichida raqam va bosh harf bo‘lishi kerak',
  })
  @IsString()
  @MinLength(8, { message: 'Parol kamida 8 belgidan iborat bo‘lishi kerak' })
  @MaxLength(128)
  @Matches(/\d/, { message: 'Parolda kamida bitta raqam bo‘lishi kerak' })
  @Matches(/[A-Z]/, {
    message: 'Parolda kamida bitta bosh harf bo‘lishi kerak',
  })
  newPassword: string;
}
