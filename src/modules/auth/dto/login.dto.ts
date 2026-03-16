import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEmail } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: "soatmurotovabrorbek23@gmail.com"})
  @ApiProperty()
  @IsEmail()
  email: string

  @ApiProperty({ example: "salom21"})
  @IsString()
  password: string
}
