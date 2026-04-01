import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangeStudentPasswordDto {
  @ApiProperty({ example: "string" })
  @IsString()
  oldPassword: string;

  @ApiProperty({ example: "string" })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
