import {
  Get,
  Injectable,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import {
  CurrentUser,
  type RequestUser,
} from 'src/common/guard/current-user.decorator';
import {
  ActiveBranch,
  CurrentActor,
  V2AuthGuard,
  V2Permission,
  V2Roles,
  type V2Actor,
} from '../common/v2-auth.guard';
import { V2Controller } from '../common/v2-controller.decorator';
import { DATE_ONLY, emptyToUndefined } from '../common/v2-dto.util';
import { V2PageQueryDto, pageOf, paginated } from '../common/v2-pagination';
import { V2ScopeService } from '../common/v2-scope.service';
import { dayRange } from '../common/v2-where';
import { parseId, toId } from '../common/v2.mapper';

const dateOnly = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, 10) : undefined;

export class V2AuditQueryDto extends V2PageQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(64)
  entity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(64)
  entity_id?: string;

  @ApiPropertyOptional({ enum: ['CREATE', 'UPDATE', 'DELETE'] })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(['CREATE', 'UPDATE', 'DELETE'])
  action?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  user_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(dateOnly)
  @Matches(DATE_ONLY)
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(dateOnly)
  @Matches(DATE_ONLY)
  start_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(dateOnly)
  @Matches(DATE_ONLY)
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(dateOnly)
  @Matches(DATE_ONLY)
  end_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  branch_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  company_id?: string;
}

type AuditRow = Prisma.AuditLogGetPayload<object>;

@Injectable()
export class V2AuditLogsService {
  constructor(
    private prisma: PrismaService,
    private scope: V2ScopeService,
  ) {}

  async list(
    user: RequestUser,
    actor: V2Actor,
    query: V2AuditQueryDto,
    headerBranchId: number | null,
  ) {
    const { page, limit, skip } = pageOf(query);
    const { org, branchId } = await this.scope.read(
      user,
      actor,
      headerBranchId,
      query.branch_id,
    );
    if (!org) return paginated([], 0, page, limit);

    const created = dayRange(
      query.startDate ?? query.start_date,
      query.endDate ?? query.end_date,
    );
    const where: Prisma.AuditLogWhereInput = {
      ...org,
      ...(branchId ? { branchId } : {}),
      ...(query.entity ? { entity: query.entity } : {}),
      ...(query.entity_id ? { entityId: query.entity_id } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.userId || query.user_id
        ? { actorId: query.userId ?? query.user_id }
        : {}),
      ...(created ? { created_at: created } : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
      }),
    ]);

    return paginated(rows.map(toAudit), total, page, limit);
  }

  async detail(user: RequestUser, id: number) {
    const org = this.scope.org(user);
    const row = org
      ? await this.prisma.auditLog.findFirst({ where: { id, ...org } })
      : null;
    if (!row) throw new NotFoundException('Yozuv topilmadi');
    return { data: toAudit(row) };
  }
}

function toAudit(row: AuditRow) {
  return {
    id: toId(row.id),
    action: row.action as 'CREATE' | 'UPDATE' | 'DELETE',
    entity: row.entity,
    entity_id: row.entityId,
    user_id: row.actorId,
    user_name: row.actorName,
    user_role: row.actorRole,
    branch_id: row.branchId ? toId(row.branchId) : null,
    company_id: row.organizationId ? toId(row.organizationId) : null,
    changes: (row.changes as Record<string, unknown> | null) ?? null,
    created_at: row.created_at.toISOString(),
  };
}

@V2Controller('audit-logs')
@ApiBearerAuth()
@UseGuards(V2AuthGuard)
@V2Roles('dev', 'owner', 'manager')
export class V2AuditController {
  constructor(private readonly audit: V2AuditLogsService) {}

  @Get()
  @V2Permission('audit.read')
  @ApiOperation({ summary: 'O‘zgarishlar jurnali' })
  list(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Query() query: V2AuditQueryDto,
    @ActiveBranch() branchId: number | null,
  ) {
    return this.audit.list(user, actor, query, branchId);
  }

  @Get(':id')
  @V2Permission('audit.read')
  @ApiOperation({ summary: 'Jurnal yozuvi' })
  detail(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.audit.detail(user, parseId(id, 'Yozuv'));
  }
}
