import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Login paytida berilgan refresh token',
    example: '3f2a...c1.9kQm...',
  })
  @IsString()
  @IsNotEmpty({ message: 'Refresh token yuborilishi shart' })
  // Token uzunligi ma'lum: bundan kattasi faqat suiiste'mol bo'lishi mumkin.
  @MaxLength(256)
  refreshToken: string;
}
