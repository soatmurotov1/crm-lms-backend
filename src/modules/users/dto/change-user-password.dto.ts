import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangeUserPasswordDto {
  @ApiProperty({ example: 'string' })
  @IsString()
  oldPassword: string;

  @ApiProperty({ example: 'string' })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
