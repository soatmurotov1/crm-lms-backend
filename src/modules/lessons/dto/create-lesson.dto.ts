import { ApiProperty } from "@nestjs/swagger"
import { IsNumber, IsString } from "class-validator"

export class CreateLessonDto {
    @ApiProperty({ example: 1 })
    @IsNumber()
    groupId: number

    @ApiProperty({ example: "string" })
    @IsString()
    title: string
}