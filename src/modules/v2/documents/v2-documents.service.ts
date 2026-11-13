import {
  BadRequestException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { Prisma, type Document } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import type { V2Actor } from '../common/v2-auth.guard';
import { V2AuditService, diff } from '../common/v2-audit.service';
import { V2FilesService, type UploadedBlob } from '../common/v2-files.service';
import { pageOf, paginated } from '../common/v2-pagination';
import { V2ScopeService } from '../common/v2-scope.service';
import { optionalId, toId } from '../common/v2.mapper';
import type {
  V2CreateDocumentDto,
  V2DocumentsQueryDto,
  V2UpdateDocumentDto,
} from './v2-documents.dto';

/** Hujjat sifatida qabul qilinadigan fayllar. */
export const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
];

@Injectable()
export class V2DocumentsService {
  constructor(
    private prisma: PrismaService,
    private scope: V2ScopeService,
    private files: V2FilesService,
    private audit: V2AuditService,
  ) {}

  async list(
    user: RequestUser,
    actor: V2Actor,
    query: V2DocumentsQueryDto,
    headerBranchId: number | null,
  ) {
    const { page, limit, skip, take } = pageOf(query);
    const { org, branchId } = await this.scope.read(
      user,
      actor,
      headerBranchId,
      query.branch_id,
    );
    if (!org || !('organizationId' in org) || !org.organizationId) {
      return paginated([], 0, page, limit);
    }

    const studentId = optionalId(query.student_id);
    const groupId = optionalId(query.group_id);
    const where: Prisma.DocumentWhereInput = {
      organizationId: org.organizationId,
      deleted_at: null,
      // Filialsiz hujjat (butun markazniki) har bir filialda ko'rinadi.
      ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(studentId ? { studentId } : {}),
      ...(groupId ? { groupId } : {}),
      ...(query.search
        ? {
            AND: [
              {
                OR: [
                  { title: { contains: query.search, mode: 'insensitive' } },
                  { fileName: { contains: query.search, mode: 'insensitive' } },
                  { note: { contains: query.search, mode: 'insensitive' } },
                ],
              },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.document.count({ where }),
      this.prisma.document.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
    ]);
    const names = await this.names(rows);
    return paginated(
      rows.map((row) => this.toDocument(row, names)),
      total,
      page,
      limit,
    );
  }

  async detail(user: RequestUser, actor: V2Actor, id: number) {
    const row = await this.findOwned(user, actor, id);
    return { data: this.toDocument(row, await this.names([row])) };
  }

  async create(
    user: RequestUser,
    actor: V2Actor,
    payload: V2CreateDocumentDto,
    file: UploadedBlob | undefined,
    headerBranchId: number | null,
  ) {
    const branchId =
      payload.branch_id !== undefined && payload.branch_id !== ''
        ? await this.scope.optionalBranch(user, payload.branch_id)
        : headerBranchId;
    const organizationId = await this.scope.writeOrg(user, branchId);
    const links = await this.links(organizationId, payload);

    const stored = await this.files.save(file, organizationId, DOCUMENT_MIME_TYPES);
    const fileName = this.fileName(file);

    const row = await this.prisma.document.create({
      data: {
        organizationId,
        branchId: branchId ?? null,
        title: payload.title?.trim() || fileName,
        type: payload.type ?? 'other',
        ...links,
        fileId: stored.id,
        fileName,
        mimeType: stored.mimeType,
        size: stored.size,
        note: payload.note || null,
        uploadedById: actor.id,
        uploadedByName: actor.name,
      },
    });

    await this.audit.record(actor, 'CREATE', 'document', row.id, {
      organizationId,
      branchId: row.branchId,
      changes: { title: row.title, file: fileName },
    });
    return { data: this.toDocument(row, await this.names([row])) };
  }

  async update(
    user: RequestUser,
    actor: V2Actor,
    id: number,
    payload: V2UpdateDocumentDto,
  ) {
    const before = await this.findOwned(user, actor, id);
    const links = await this.links(before.organizationId, payload);
    const branchId =
      payload.branch_id !== undefined
        ? await this.scope.optionalBranch(user, payload.branch_id)
        : undefined;

    const row = await this.prisma.document.update({
      where: { id },
      data: {
        ...(payload.title !== undefined ? { title: payload.title } : {}),
        ...(payload.type !== undefined ? { type: payload.type } : {}),
        ...(payload.note !== undefined ? { note: payload.note || null } : {}),
        ...(branchId !== undefined ? { branchId } : {}),
        ...links,
      },
    });
    const names = await this.names([before, row]);
    await this.audit.record(actor, 'UPDATE', 'document', id, {
      organizationId: row.organizationId,
      branchId: row.branchId,
      changes: diff(this.toDocument(before, names), this.toDocument(row, names)),
    });
    return { data: this.toDocument(row, names) };
  }

  async remove(user: RequestUser, actor: V2Actor, id: number): Promise<void> {
    const row = await this.findOwned(user, actor, id);
    await this.prisma.document.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
    await this.audit.record(actor, 'DELETE', 'document', id, {
      organizationId: row.organizationId,
      branchId: row.branchId,
      changes: { title: row.title },
    });
  }

  async download(user: RequestUser, actor: V2Actor, id: number) {
    const row = await this.findOwned(user, actor, id);
    const file = await this.files.stream(row.fileId);
    return new StreamableFile(file.getStream(), {
      type: row.mimeType,
      length: row.size,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
    });
  }

  // --- Yordamchilar ---------------------------------------------------------

  private async findOwned(
    user: RequestUser,
    actor: V2Actor,
    id: number,
  ): Promise<Document> {
    const org = this.scope.org(user);
    const row = org
      ? await this.prisma.document.findFirst({
          where: { id, ...org, deleted_at: null },
        })
      : null;
    if (!row) throw new NotFoundException('Hujjat topilmadi');

    // Filial xodimi boshqa filial hujjatini ko'rmaydi.
    if (
      row.branchId &&
      actor.homeBranchId &&
      !['dev', 'owner', 'accountant'].includes(actor.role) &&
      row.branchId !== actor.homeBranchId
    ) {
      throw new NotFoundException('Hujjat topilmadi');
    }
    return row;
  }

  private async links(
    organizationId: number,
    payload: { student_id?: string | null; group_id?: string | null },
  ) {
    const result: { studentId?: number | null; groupId?: number | null } = {};
    if (payload.student_id !== undefined) {
      const id = optionalId(payload.student_id || undefined);
      if (id) {
        const found = await this.prisma.student.findFirst({
          where: { id, organizationId, deleted_at: null },
          select: { id: true },
        });
        if (!found) throw new BadRequestException('O‘quvchi topilmadi');
      }
      result.studentId = id ?? null;
    }
    if (payload.group_id !== undefined) {
      const id = optionalId(payload.group_id || undefined);
      if (id) {
        const found = await this.prisma.group.findFirst({
          where: { id, organizationId, deleted_at: null },
          select: { id: true },
        });
        if (!found) throw new BadRequestException('Guruh topilmadi');
      }
      result.groupId = id ?? null;
    }
    return result;
  }

  /** Multer fayl nomini latin1 deb o'qiydi — UTF-8 ga qaytaramiz. */
  private fileName(file: UploadedBlob | undefined): string {
    const raw = (file as { originalname?: string } | undefined)?.originalname ?? 'hujjat';
    const decoded = Buffer.from(raw, 'latin1').toString('utf8');
    const name = (decoded.includes('�') ? raw : decoded).replace(/[\\/]/g, '_');
    return name.slice(0, 200) || 'hujjat';
  }

  private async names(rows: Document[]) {
    const ids = (pick: (row: Document) => number | null) => [
      ...new Set(rows.map(pick).filter((id): id is number => !!id)),
    ];
    const [branches, students, groups] = await Promise.all([
      this.prisma.branch.findMany({
        where: { id: { in: ids((row) => row.branchId) } },
        select: { id: true, name: true },
      }),
      this.prisma.student.findMany({
        where: { id: { in: ids((row) => row.studentId) } },
        select: { id: true, fullName: true },
      }),
      this.prisma.group.findMany({
        where: { id: { in: ids((row) => row.groupId) } },
        select: { id: true, name: true },
      }),
    ]);
    return {
      branches: new Map(branches.map((row) => [row.id, row.name])),
      students: new Map(students.map((row) => [row.id, row.fullName])),
      groups: new Map(groups.map((row) => [row.id, row.name])),
    };
  }

  private toDocument(
    row: Document,
    names: Awaited<ReturnType<V2DocumentsService['names']>>,
  ) {
    return {
      id: toId(row.id),
      title: row.title,
      type: row.type,
      branch_id: row.branchId ? toId(row.branchId) : null,
      branch_name: row.branchId ? (names.branches.get(row.branchId) ?? null) : null,
      student_id: row.studentId ? toId(row.studentId) : null,
      student_name: row.studentId ? (names.students.get(row.studentId) ?? null) : null,
      group_id: row.groupId ? toId(row.groupId) : null,
      group_name: row.groupId ? (names.groups.get(row.groupId) ?? null) : null,
      file_name: row.fileName,
      mime_type: row.mimeType,
      size: row.size,
      note: row.note,
      uploaded_by_id: row.uploadedById,
      uploaded_by_name: row.uploadedByName,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }
}
