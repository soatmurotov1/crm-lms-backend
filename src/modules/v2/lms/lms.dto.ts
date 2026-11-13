import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { V2PageQueryDto } from '../common/v2-pagination';
import { emptyToUndefined, trim } from '../common/v2-dto.util';

const SORT_ORDERS = ['asc', 'desc'] as const;

/** Ro'yxat so'rovi: sahifa, qidiruv, saralash. */
export class LmsListQueryDto extends V2PageQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: SORT_ORDERS })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(SORT_ORDERS)
  order?: (typeof SORT_ORDERS)[number];
}

// --- Fanlar -----------------------------------------------------------------

export class SubjectsQueryDto extends LmsListQueryDto {
  @ApiPropertyOptional({ description: 'Faqat shu kategoriya ichidagilar' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  parent_id?: string;
}

export class CreateSubjectDto {
  @ApiProperty({ example: 'Matematika' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Nomi kiritilishi shart' })
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: '#2563eb' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Rang #RRGGBB ko‘rinishida bo‘lsin' })
  color?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  parent_id?: string | null;
}

export class UpdateSubjectDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  parent_id?: string | null;
}

// --- O'quv dasturi ------------------------------------------------------------

export class CreateModuleDto {
  @ApiProperty({ example: '1-modul: Kirish' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Sarlavha kiritilishi shart' })
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  position?: number;
}

export class UpdateModuleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  position?: number;
}

export class CreateCourseLessonDto {
  @ApiProperty({ example: 'Kasrlar' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Sarlavha kiritilishi shart' })
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ description: 'Dars matni (markdown)' })
  @IsOptional()
  @IsString()
  @MaxLength(50000)
  content?: string;

  @ApiPropertyOptional({ example: 'https://www.youtube.com/watch?v=...' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUrl({ require_protocol: true }, { message: 'Video havolasi noto‘g‘ri' })
  @MaxLength(500)
  video_url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  duration_min?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  position?: number;
}

export class UpdateCourseLessonDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(50000)
  content?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsUrl({ require_protocol: true }, { message: 'Video havolasi noto‘g‘ri' })
  @MaxLength(500)
  video_url?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  duration_min?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  position?: number;
}

export const MATERIAL_KINDS = ['video', 'file', 'link'] as const;

/** Multipart (fayl `file` nomi bilan) yoki JSON (havola). */
export class CreateMaterialDto {
  @ApiPropertyOptional({ description: 'Bo‘sh bo‘lsa — fayl nomi' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiProperty({ enum: MATERIAL_KINDS })
  @IsIn(MATERIAL_KINDS, { message: 'Material turi noto‘g‘ri' })
  kind: (typeof MATERIAL_KINDS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUrl({ require_protocol: true }, { message: 'Havola noto‘g‘ri' })
  @MaxLength(500)
  url?: string;
}

export class EnrollStudentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'O‘quvchini tanlang' })
  student_id: string;

  @ApiPropertyOptional({ description: 'Kurs guruhi (ixtiyoriy)' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  group_id?: string;
}

export class ProgressMarkDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  student_id: string;

  @ApiProperty({ description: 'true — tugatdi, false — belgini olib tashlash' })
  @IsBoolean({ message: 'completed true yoki false bo‘lsin' })
  completed: boolean;
}

// --- Topshiriqlar -------------------------------------------------------------

const ASSIGNMENT_STATUSES = ['draft', 'published', 'closed'] as const;

export class AssignmentsQueryDto extends LmsListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  course_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  group_id?: string;

  @ApiPropertyOptional({ enum: ASSIGNMENT_STATUSES })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(ASSIGNMENT_STATUSES)
  status?: (typeof ASSIGNMENT_STATUSES)[number];
}

export class CreateAssignmentDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Sarlavha kiritilishi shart' })
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  course_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  group_id?: string;

  @ApiPropertyOptional({ example: '2026-12-01T18:00:00.000Z' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsDateString({}, { message: 'Muddat noto‘g‘ri' })
  due_date?: string;

  @ApiPropertyOptional({ default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  max_score?: number;

  @ApiPropertyOptional({ enum: ASSIGNMENT_STATUSES })
  @IsOptional()
  @IsIn(ASSIGNMENT_STATUSES)
  status?: (typeof ASSIGNMENT_STATUSES)[number];
}

export class UpdateAssignmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(10000)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsDateString()
  due_date?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  max_score?: number;

  @ApiPropertyOptional({ enum: ASSIGNMENT_STATUSES })
  @IsOptional()
  @IsIn(ASSIGNMENT_STATUSES)
  status?: (typeof ASSIGNMENT_STATUSES)[number];
}

export class CreateSubmissionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'O‘quvchini tanlang' })
  student_id: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  text?: string;
}

export class GradeSubmissionDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt({ message: 'Ball butun son bo‘lsin' })
  @Min(0)
  @Max(1000)
  score: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  feedback?: string;

  @ApiPropertyOptional({ enum: ['graded', 'returned'] })
  @IsOptional()
  @IsIn(['graded', 'returned'])
  status?: 'graded' | 'returned';
}

// --- Testlar va imtihonlar -----------------------------------------------------

const QUIZ_KINDS = ['quiz', 'exam'] as const;
const QUIZ_STATUSES = ['draft', 'published', 'closed'] as const;
export const QUESTION_TYPES = ['single', 'multiple', 'text'] as const;

export class QuizzesQueryDto extends AssignmentsQueryDto {
  @ApiPropertyOptional({ enum: QUIZ_KINDS })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(QUIZ_KINDS)
  kind?: (typeof QUIZ_KINDS)[number];
}

export class CreateQuizDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Sarlavha kiritilishi shart' })
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ enum: QUIZ_KINDS })
  @IsOptional()
  @IsIn(QUIZ_KINDS)
  kind?: (typeof QUIZ_KINDS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  course_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  group_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  duration_min?: number;

  @ApiPropertyOptional({ default: 60 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  pass_percent?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  max_attempts?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsDateString()
  starts_at?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsDateString()
  ends_at?: string;

  @ApiPropertyOptional({ enum: QUIZ_STATUSES })
  @IsOptional()
  @IsIn(QUIZ_STATUSES)
  status?: (typeof QUIZ_STATUSES)[number];
}

export class UpdateQuizDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  duration_min?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  pass_percent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  max_attempts?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsDateString()
  starts_at?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsDateString()
  ends_at?: string | null;

  @ApiPropertyOptional({ enum: QUIZ_STATUSES })
  @IsOptional()
  @IsIn(QUIZ_STATUSES)
  status?: (typeof QUIZ_STATUSES)[number];
}

export class QuestionDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Savol matni kiritilishi shart' })
  @MaxLength(5000)
  text: string;

  @ApiProperty({ enum: QUESTION_TYPES })
  @IsIn(QUESTION_TYPES, { message: 'Savol turi noto‘g‘ri' })
  type: (typeof QUESTION_TYPES)[number];

  @ApiPropertyOptional({ type: [String], description: 'Variantlar' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  options?: string[];

  @ApiProperty({
    description:
      'single/multiple — to‘g‘ri variant indekslari; text — qabul qilinadigan javoblar',
    example: [0],
  })
  @IsArray()
  @ArrayMaxSize(10)
  correct: (number | string)[];

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  points?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  position?: number;
}

export class SubmitAttemptDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'O‘quvchini tanlang' })
  student_id: string;

  @ApiProperty({
    description: 'Savol id → javob (variant indeksi, indekslar ro‘yxati yoki matn)',
    example: { '1': 0, '2': [0, 2], '3': 'javob' },
  })
  @IsObject()
  answers: Record<string, number | number[] | string>;
}

export class ReviewAttemptDto {
  @ApiProperty()
  @Type(() => Number)
  @Min(0)
  @Max(10000)
  score: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  feedback?: string;
}

// --- Baholar, progress, bildirishnomalar ---------------------------------------

export class GradesQueryDto extends V2PageQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  student_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  group_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  course_id?: string;

  @ApiPropertyOptional({ enum: ['assignment', 'quiz'] })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(['assignment', 'quiz'])
  source?: 'assignment' | 'quiz';
}

const NOTIFICATION_TYPES = ['info', 'warning', 'lesson', 'homework', 'payment', 'system'] as const;
const NOTIFICATION_AUDIENCES = ['all', 'teachers', 'students', 'group', 'user'] as const;

export class NotificationsQueryDto extends V2PageQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  unread?: boolean;
}

export class CreateNotificationDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Sarlavha kiritilishi shart' })
  @MaxLength(200)
  title: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Matn kiritilishi shart' })
  @MaxLength(5000)
  message: string;

  @ApiPropertyOptional({ enum: NOTIFICATION_TYPES })
  @IsOptional()
  @IsIn(NOTIFICATION_TYPES)
  type?: (typeof NOTIFICATION_TYPES)[number];

  @ApiProperty({ enum: NOTIFICATION_AUDIENCES })
  @IsIn(NOTIFICATION_AUDIENCES, { message: 'Qabul qiluvchilar noto‘g‘ri' })
  audience: (typeof NOTIFICATION_AUDIENCES)[number];

  @ApiPropertyOptional({ description: 'audience=group' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  group_id?: string;

  @ApiPropertyOptional({
    description: 'audience=user: xodim id (`12`) yoki o‘qituvchi (`t12`)',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  recipient_id?: string;
}

