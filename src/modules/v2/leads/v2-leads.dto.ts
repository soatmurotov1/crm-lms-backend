import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PHONE_REGEX, normalizePhone } from 'src/common/utils/phone.util';
import { V2PageQueryDto } from '../common/v2-pagination';
import { emptyToUndefined, toBool, trim } from '../common/v2-dto.util';

export const LEAD_SOURCES = [
  'telegram',
  'instagram',
  'referral',
  'directory_map',
  'olx',
  'walk_in',
  'other',
  'website',
  'recommendation',
  'banner',
] as const;
export const LEAD_LOST_REASONS = [
  'EXPENSIVE',
  'FAR_AWAY',
  'BAD_SCHEDULE',
  'COMPETITOR',
  'NOT_INTERESTED',
  'NO_ANSWER',
  'OTHER',
] as const;
export const LEAD_ACTIVITY_KINDS = [
  'NOTE',
  'CALL',
  'TASK',
  'STAGE_CHANGE',
  'SYSTEM',
] as const;
const COURSE_TYPES = ['online', 'offline'] as const;
const PERIODS = ['7d', '30d', '60d', 'all'] as const;
const TABS = ['new', 'in_progress', 'won', 'lost', 'all'] as const;

const phone = ({ value }: { value: unknown }) => normalizePhone(value);

export class V2LeadsQueryDto extends V2PageQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  stageId?: string;

  @ApiPropertyOptional({ enum: LEAD_SOURCES })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(LEAD_SOURCES)
  source?: string;

  @ApiPropertyOptional({ enum: COURSE_TYPES })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(COURSE_TYPES)
  courseType?: 'online' | 'offline';

  @ApiPropertyOptional({ description: "O'qish yo'nalishi" })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(100)
  direction?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  mine?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  assigneeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  overdueOnly?: boolean;

  @ApiPropertyOptional({ enum: PERIODS })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(PERIODS)
  period?: (typeof PERIODS)[number];

  @ApiPropertyOptional({ enum: TABS })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(TABS)
  tab?: (typeof TABS)[number];
}

export class V2LeadMetricsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ enum: PERIODS })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(PERIODS)
  period?: (typeof PERIODS)[number];
}

export class V2LeadDuplicateQueryDto {
  @ApiProperty()
  @Transform(phone)
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  excludeLeadId?: string;
}

class LeadFieldsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(150)
  email?: string;

  @ApiPropertyOptional({ enum: COURSE_TYPES })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(COURSE_TYPES)
  courseType?: 'online' | 'offline';

  @ApiPropertyOptional({ example: 'Frontend' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  direction?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(150)
  sourceOther?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  referrerStudentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  referrerStaffId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  desiredGroupId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  assigneeUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class V2CreateLeadDto extends LeadFieldsDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: '+998901234567' })
  @Transform(phone)
  @Matches(PHONE_REGEX, { message: 'Telefon raqami noto‘g‘ri' })
  phone!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  branchId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  stageId?: string;

  @ApiProperty({ enum: LEAD_SOURCES })
  @IsIn(LEAD_SOURCES)
  source!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) utmSource?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) utmMedium?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) utmCampaign?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) utmContent?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) utmTerm?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) referrer?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) landing?: string;
}

export class V2UpdateLeadDto extends LeadFieldsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(phone)
  @Matches(PHONE_REGEX, { message: 'Telefon raqami noto‘g‘ri' })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ enum: LEAD_SOURCES })
  @IsOptional()
  @IsIn(LEAD_SOURCES)
  source?: string;
}

export class V2LeadStageTransitionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  stageId!: string;

  @ApiPropertyOptional({ enum: LEAD_LOST_REASONS })
  @IsOptional()
  @IsIn(LEAD_LOST_REASONS)
  lostReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  lostReasonOther?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;
}

export class V2AssignLeadDto {
  @ApiProperty({ nullable: true })
  @ValidateIf((_, value) => value !== null)
  @IsString()
  assigneeUserId!: string | null;
}

export class V2ConvertLeadDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class V2CreateLeadActivityDto {
  @ApiProperty({ enum: LEAD_ACTIVITY_KINDS })
  @IsIn(LEAD_ACTIVITY_KINDS)
  kind!: (typeof LEAD_ACTIVITY_KINDS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  body?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsISO8601()
  dueAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}

export class V2UpdateLeadActivityDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  body?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsISO8601()
  doneAt?: string | null;
}

export class V2LeadStageItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

  @ApiProperty({ example: '#3B82F6' })
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class V2UpdateLeadStagesDto {
  @ApiProperty({ type: [V2LeadStageItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => V2LeadStageItemDto)
  stages!: V2LeadStageItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  moveToStageId?: string;
}

export class V2CreateLeadSourceDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;
}
