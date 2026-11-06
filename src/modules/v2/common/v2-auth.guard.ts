import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role, Status } from '@prisma/client';
import { AuthGuard } from 'src/common/guard/jwt-auth.guard';
import type {
  AuthedRequest,
  RequestUser,
} from 'src/common/guard/current-user.decorator';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { SessionService } from 'src/common/session/session.service';
import { isSuperAdmin } from 'src/common/utils/org-scope.util';
import { V2_SESSION_COOKIE, readCookie } from './v2-cookie';
import {
  isGranted,
  parseAssignments,
  type PermissionAssignment,
} from './v2-permissions';
import {
  toId,
  toTeacherId,
  toV2Role,
  type StaffRef,
  type V2Role,
} from './v2.mapper';

/** So'rov egasi — xodim yoki o'qituvchi, frontend ko'radigan ko'rinishda. */
export interface V2Actor {
  /** `"12"` (xodim) yoki `"t12"` (o'qituvchi). */
  id: string;
  ref: StaffRef;
  role: V2Role;
  name: string;
  organizationId: number | null;
  /** Xodimning asosiy filiali (egasi va buxgalterda bo'lmasligi mumkin). */
  homeBranchId: number | null;
  /** Ruxsatlar qo'lda sozlangan bo'lsa — ro'yxat, aks holda `null` (rol bo'yicha). */
  permissions: PermissionAssignment[] | null;
}

/** `V2AuthGuard` o'tgan so'rov: foydalanuvchi, aktor va tanlangan filial. */
export interface V2Request extends AuthedRequest {
  /** `X-Branch-Id` sarlavhasidagi filial; yuborilmagan bo'lsa `null`. */
  branchId?: number | null;
  actor?: V2Actor;
}

/** Bu panelga kira oladigan rollar. O'quvchining o'z portali bor. */
const PANEL_ROLES = new Set<Role>([
  Role.SUPERADMIN,
  Role.ADMIN,
  Role.MANAGEMENT,
  Role.ADMINSTRATOR,
  Role.ACCOUNTANT,
  Role.TEACHER,
]);

const V2_ROLES_KEY = 'v2:roles';
const V2_PERMISSION_KEY = 'v2:permission';

/** Endpointga kira oladigan frontend rollari. Yozilmasa — panelning hamma roli. */
export const V2Roles = (...roles: V2Role[]) => SetMetadata(V2_ROLES_KEY, roles);

/**
 * Endpoint talab qiladigan ruxsat kaliti (masalan `students.create`).
 * Faqat ruxsatlari qo'lda sozlangan xodimga qo'llanadi — qolganlar uchun
 * `@V2Roles` hal qiladi.
 */
export const V2Permission = (permission: string) =>
  SetMetadata(V2_PERMISSION_KEY, permission);

/** Hamma filialni ko'radigan rollar ("Barcha filiallar" ko'rinishi). */
export const CROSS_BRANCH_ROLES: V2Role[] = ['dev', 'owner', 'accountant'];

/**
 * `/api/v2` uchun kirish tekshiruvi. Asosiy `AuthGuard` dan farqlari:
 *
 *  1. Token httpOnly cookie'da ham kelishi mumkin. Frontend tokenni faqat
 *     xotirada saqlaydi — sahifa yangilanganda sessiya cookie orqali tiklanadi.
 *  2. O'qituvchi va buxgalter ham kiradi (o'qituvchi `Teacher` jadvalidan).
 *  3. `X-Branch-Id` tekshiriladi va so'rovga biriktiriladi. Begona
 *     tashkilotning filial id'si bilan kelgan so'rov shu yerda to'xtaydi,
 *     xizmatlar esa `branchId` ga ishonib ishlaydi.
 *  4. `@V2Roles` / `@V2Permission` shu yerda tekshiriladi.
 */
@Injectable()
export class V2AuthGuard extends AuthGuard {
  constructor(
    jwtService: JwtService,
    prisma: PrismaService,
    sessionService: SessionService,
    private readonly reflector: Reflector,
  ) {
    super(jwtService, prisma, sessionService);
  }

  protected extractToken(req: AuthedRequest): string | undefined {
    return (
      super.extractToken(req) ??
      readCookie(req.headers.cookie, V2_SESSION_COOKIE)
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);

    const req = context.switchToHttp().getRequest<V2Request>();
    const user = req.user;

    if (!user || !PANEL_ROLES.has(user.role)) {
      throw new ForbiddenException('Bu panelga kirish huquqingiz yo‘q');
    }

    req.actor = await this.loadActor(user);
    req.branchId = await this.resolveBranch(req);

    const roles = this.reflector.getAllAndOverride<V2Role[] | undefined>(
      V2_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (roles?.length && !roles.includes(req.actor.role)) {
      throw new ForbiddenException('Bu amal uchun huquqingiz yo‘q');
    }

    const permission = this.reflector.getAllAndOverride<string | undefined>(
      V2_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (
      permission &&
      !isGranted(req.actor, permission, req.branchId ?? null)
    ) {
      throw new ForbiddenException('Bu amal uchun ruxsat berilmagan');
    }

    return true;
  }

  private async loadActor(user: RequestUser): Promise<V2Actor> {
    if (user.role === Role.TEACHER) {
      const teacher = await this.prisma.teacher.findUnique({
        where: { id: user.id },
        select: {
          fullName: true,
          branchId: true,
          accessVersion: true,
          permissions: true,
          deleted_at: true,
        },
      });
      if (!teacher || teacher.deleted_at) throw new UnauthorizedException();

      return {
        id: toTeacherId(user.id),
        ref: { kind: 'teacher', id: user.id },
        role: 'teacher',
        name: teacher.fullName,
        organizationId: user.organizationId,
        homeBranchId: teacher.branchId,
        permissions:
          teacher.accessVersion > 0
            ? parseAssignments(teacher.permissions)
            : null,
      };
    }

    const row = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        fullName: true,
        branchId: true,
        accessVersion: true,
        permissions: true,
        deleted_at: true,
        managedBranches: {
          where: { status: Status.ACTIVE },
          select: { id: true },
          orderBy: { id: 'asc' },
          take: 1,
        },
      },
    });
    const role = toV2Role(user.role);
    if (!row || row.deleted_at || !role) throw new UnauthorizedException();

    return {
      id: toId(user.id),
      ref: { kind: 'user', id: user.id },
      role,
      name: row.fullName,
      organizationId: user.organizationId,
      homeBranchId: row.branchId ?? row.managedBranches[0]?.id ?? null,
      permissions:
        row.accessVersion > 0 ? parseAssignments(row.permissions) : null,
    };
  }

  private async resolveBranch(req: V2Request): Promise<number | null> {
    const raw = req.headers['x-branch-id'];
    const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();

    if (!value) return null;

    const id = /^\d{1,9}$/.test(value) ? Number(value) : 0;
    const branch = id
      ? await this.prisma.branch.findUnique({
          where: { id },
          select: { organizationId: true, status: true },
        })
      : null;

    if (
      !branch ||
      branch.status !== Status.ACTIVE ||
      (!isSuperAdmin(req.user) &&
        branch.organizationId !== req.user?.organizationId)
    ) {
      throw new ForbiddenException('Bu filialga kirish huquqingiz yo‘q');
    }

    return id;
  }
}

/** Tekshirilgan `X-Branch-Id`; yuborilmagan bo'lsa `null`. */
export const ActiveBranch = createParamDecorator(
  (_data: unknown, context: ExecutionContext): number | null =>
    context.switchToHttp().getRequest<V2Request>().branchId ?? null,
);

/** So'rov egasi (`V2AuthGuard` dan keyin har doim mavjud). */
export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): V2Actor => {
    const actor = context.switchToHttp().getRequest<V2Request>().actor;
    if (!actor) throw new UnauthorizedException();
    return actor;
  },
);
