import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEmail } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: "string"})
  @ApiProperty()
  @IsEmail()
  email: string

  @ApiProperty({ example: "string"})
  @IsString()
  password: string
}
