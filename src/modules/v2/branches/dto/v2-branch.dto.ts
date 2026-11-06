import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class V2CreateBranchDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Filial nomi kiritilishi kerak' })
  @MaxLength(120)
  name: string;

  @ApiProperty({ description: 'Manzil' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Manzil kiritilishi kerak' })
  @MaxLength(255)
  location: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(32)
  phone?: string;
}

export class V2UpdateBranchDto extends PartialType(V2CreateBranchDto) {}

export class V2BranchesQueryDto {
  @ApiPropertyOptional({ description: 'O‘chirilganlarni ham ko‘rsatish' })
  @IsOptional()
  // `obj` dan o'qiladi: `value` bu yerga yashirin konvertatsiyadan o'tib
  // keladi va "false" matni ham `true` bo'lib qoladi.
  @Transform(({ obj }: { obj: { include_deleted?: unknown } }) =>
    [true, 'true', '1'].includes(obj.include_deleted as string),
  )
  @IsBoolean()
  include_deleted?: boolean;

  @ApiPropertyOptional({ description: 'Faqat platforma egasi uchun' })
  @IsOptional()
  @IsString()
  company_id?: string;
}
