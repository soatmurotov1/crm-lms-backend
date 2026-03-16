import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: `string` })
  @IsString()
  oldPassword: string

  @ApiProperty({ example: `string` })
  @IsString()
  @MinLength(6)
  newPassword: string
}