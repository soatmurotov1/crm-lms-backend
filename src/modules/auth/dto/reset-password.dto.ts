import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'string' })
  @IsString()
  @MinLength(8)
  oldPassword: string;

  @ApiProperty({ example: 'string' })
  @IsString()
  @MinLength(8)
  password: string;
}
