import {
  Body,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PrismaService } from 'src/common/prisma/prisma.service';
import {
  CurrentUser,
  type RequestUser,
} from 'src/common/guard/current-user.decorator';
import {
  CurrentActor,
  V2AuthGuard,
  V2Permission,
  V2Roles,
  type V2Actor,
} from '../common/v2-auth.guard';
import { V2AuditService } from '../common/v2-audit.service';
import { V2Controller } from '../common/v2-controller.decorator';
import { toIdString } from '../common/v2-dto.util';
import { V2ScopeService } from '../common/v2-scope.service';
import { parseId, toId } from '../common/v2.mapper';

const EXAM_TYPES = ['THEORY', 'PRACTICE'] as const;

/**
 * Davlat imtihoni natijasi. Frontend `snake_case` yuboradi, eski shartnoma
 * esa `camelCase` — ikkalasi ham qabul qilinadi.
 */
export class V2CreateExamDto {
  @ApiPropertyOptional()
  @ValidateIf((dto: V2CreateExamDto) => !dto.studentId)
  @Transform(toIdString)
  @IsString()
  student_id?: string;

  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  @Transform(toIdString)
  @IsString()
  studentId?: string;

  @ApiPropertyOptional({ enum: EXAM_TYPES })
  @ValidateIf((dto: V2CreateExamDto) => !dto.examType)
  @IsIn(EXAM_TYPES)
  exam_type?: (typeof EXAM_TYPES)[number];

  @ApiPropertyOptional({ enum: EXAM_TYPES, deprecated: true })
  @IsOptional()
  @IsIn(EXAM_TYPES)
  examType?: (typeof EXAM_TYPES)[number];

  @ApiPropertyOptional({ example: 85 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  score?: number | null;

  @IsBoolean()
  passed: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  date?: string;
}

@Injectable()
export class V2ExamsService {
  constructor(
    private prisma: PrismaService,
    private scope: V2ScopeService,
    private audit: V2AuditService,
  ) {}

  async byStudent(user: RequestUser, studentId: number) {
    await this.ownedStudent(user, studentId);
    const rows = await this.prisma.studentExam.findMany({
      where: { studentId },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    });
    return { data: rows.map((row) => this.toExam(row)) };
  }

  async create(user: RequestUser, actor: V2Actor, payload: V2CreateExamDto) {
    const studentId = parseId(payload.student_id ?? payload.studentId, 'O‘quvchi');
    const examType = payload.exam_type ?? payload.examType ?? 'THEORY';
    const student = await this.ownedStudent(user, studentId);

    const row = await this.prisma.studentExam.create({
      data: {
        studentId,
        examType,
        score: payload.score ?? null,
        passed: payload.passed,
        notes: payload.notes?.trim() || null,
        date: payload.date ? new Date(payload.date) : new Date(),
        createdById: actor.id,
      },
    });

    // Amaliy imtihon — yakuniy bosqich: o'quvchi natijasi shu bilan belgilanadi.
    if (examType === 'PRACTICE') {
      await this.prisma.student.update({
        where: { id: studentId },
        data: { result: payload.passed ? 'topshirdi' : 'yiqildi' },
      });
    }

    await this.audit.record(actor, 'CREATE', 'exam', row.id, {
      organizationId: student.organizationId,
      branchId: student.branchId,
      changes: { student_id: toId(studentId), exam_type: examType, passed: payload.passed },
    });

    return { data: this.toExam(row) };
  }

  private async ownedStudent(user: RequestUser, id: number) {
    const org = this.scope.org(user);
    const student = org
      ? await this.prisma.student.findFirst({
          where: { id, ...org, deleted_at: null },
          select: { id: true, organizationId: true, branchId: true },
        })
      : null;
    if (!student) throw new NotFoundException('O‘quvchi topilmadi');
    return student;
  }

  private toExam(row: {
    id: number;
    studentId: number;
    examType: string;
    score: number | null;
    passed: boolean;
    notes: string | null;
    date: Date;
    created_at: Date;
  }) {
    return {
      id: toId(row.id),
      student_id: toId(row.studentId),
      exam_type: row.examType as 'THEORY' | 'PRACTICE',
      score: row.score,
      passed: row.passed,
      notes: row.notes,
      date: row.date.toISOString(),
      created_at: row.created_at.toISOString(),
    };
  }
}

@V2Controller('exams')
@ApiBearerAuth()
@UseGuards(V2AuthGuard)
export class V2ExamsController {
  constructor(private readonly exams: V2ExamsService) {}

  @Get('student/:id')
  @V2Permission('exams.read')
  @ApiOperation({ summary: 'O‘quvchining imtihon natijalari' })
  byStudent(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.exams.byStudent(user, parseId(id, 'O‘quvchi'));
  }

  @Post()
  @V2Roles('dev', 'owner', 'manager', 'operator', 'teacher')
  @V2Permission('exams.create')
  @ApiOperation({ summary: 'Imtihon natijasini kiritish' })
  create(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Body() payload: V2CreateExamDto,
  ) {
    return this.exams.create(user, actor, payload);
  }
}
