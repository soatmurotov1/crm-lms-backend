import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ReplyTicketDto {
  @ApiProperty({ example: 'Muammo hal qilindi, tekshirib ko‘ring.' })
  @IsString()
  message: string;
}
