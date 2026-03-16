import { IsString, IsInt, IsOptional, IsEnum, IsDecimal, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { Status, CourseLevel } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRoomDto {
    @ApiProperty()
    @IsString()
    name: string;

    @ApiProperty()
    @IsNumber()
    capacity:number
    
}