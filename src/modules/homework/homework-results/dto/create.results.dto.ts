import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNumber, IsString } from "class-validator";

export class CreateHomeworkResultsDto {
    @ApiProperty({ example: "string"})
    @IsString()
    title: string

    @ApiProperty({ example: 1})
    @IsNumber()
    @Type(()=> Number)
    homeworkId: number

    @ApiProperty({ example: 1})
    @IsNumber()
    @Type(()=> Number)
    studentId: number

    @ApiProperty({ example: 1})
    @IsNumber()
    @Type(()=> Number)
    score: number
}