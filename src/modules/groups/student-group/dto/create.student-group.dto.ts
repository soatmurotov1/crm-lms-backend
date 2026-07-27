import { ApiProperty } from '@nestjs/swagger';
import { IsInt } from 'class-validator';

export class CreateStudentGroupDto {
  @ApiProperty()
  @IsInt()
  groupId: number;

  @ApiProperty()
  @IsInt()
  studentId: number;
}
