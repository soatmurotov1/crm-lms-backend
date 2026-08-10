import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Chiqishda access token bo'lsa sessiya o'shaning `sid` maydonidan topiladi.
 * Access token allaqachon eskirgan bo'lsa (chiqish tugmasi kech bosildi),
 * refresh token yuboriladi — shunda ham sessiya serverda yopiladi.
 */
export class LogoutDto {
  @ApiPropertyOptional({ description: 'Refresh token (ixtiyoriy)' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  refreshToken?: string;
}
