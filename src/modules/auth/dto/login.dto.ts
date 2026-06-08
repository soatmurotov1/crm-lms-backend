import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEmail, IsOptional } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'string' })
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'string' })
  @IsString()
  password: string;

  @ApiProperty({ example: 'string', required: false })
  @IsOptional()
  @IsString()
  deviceName?: string;

  @ApiProperty({ example: 'string', required: false })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiProperty({ example: 'string', required: false })
  @IsOptional()
  @IsString()
  userAgent?: string;
}
