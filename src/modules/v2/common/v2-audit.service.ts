import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import type { V2Actor } from './v2-auth.guard';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';

/**
 * Yozish amallarining izi (`GET /audit-logs`).
 *
 * Audit asosiy amalni hech qachon buzmasligi kerak: yozib bo'lmasa xato
 * logga tushadi, foydalanuvchi esa natijasini oladi.
 */
@Injectable()
export class V2AuditService {
  private readonly logger = new Logger(V2AuditService.name);

  constructor(private prisma: PrismaService) {}

  async record(
    actor: V2Actor,
    action: AuditAction,
    entity: string,
    entityId: number | string,
    options: {
      organizationId?: number | null;
      branchId?: number | null;
      changes?: Record<string, unknown> | null;
    } = {},
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          organizationId: options.organizationId ?? actor.organizationId,
          branchId: options.branchId ?? null,
          action,
          entity,
          entityId: String(entityId),
          actorId: actor.id,
          actorName: actor.name,
          actorRole: actor.role,
          changes: options.changes
            ? (JSON.parse(JSON.stringify(options.changes)) as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
      });
    } catch (error) {
      this.logger.error(
        `Audit yozuvi saqlanmadi (${entity} #${entityId}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

/** `before` → `after` farqi: faqat o'zgargan maydonlar. */
export function diff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const result: Record<string, { from: unknown; to: unknown }> = {};

  for (const key of Object.keys(after)) {
    const from = before[key];
    const to = after[key];
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      result[key] = { from: from ?? null, to: to ?? null };
    }
  }

  return result;
}
