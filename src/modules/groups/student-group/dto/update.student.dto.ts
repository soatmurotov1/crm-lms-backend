import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsOptional } from "class-validator";

export class updateStudentGroupDto{
    @ApiProperty()
    @IsOptional()
    @IsInt()
    id : number

    @ApiProperty()
    @IsOptional()
    @IsInt()
    groupId : number
}
