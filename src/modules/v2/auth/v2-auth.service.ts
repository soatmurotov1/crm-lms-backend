import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, Status, UserStatus } from '@prisma/client';
import { comparePassword, hashPassword } from 'src/common/bcrypt/bcrypt';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { SessionService } from 'src/common/session/session.service';
import {
  parseStoredAccess,
  type PermissionAssignment,
} from '../common/v2-permissions';
import {
  toId,
  toTeacherId,
  toV2Role,
  type StaffRef,
  type V2Role,
} from '../common/v2.mapper';
import type { V2ChangePasswordDto, V2LoginDto } from './dto/v2-auth.dto';

export interface V2RequestContext {
  ipAddress?: string;
  userAgent?: string;
}

/** Frontenddagi `User` (features/staff/types.ts) bilan bir xil shakl. */
export interface V2User {
  id: string;
  name: string;
  email: string;
  role: V2Role;
  branch_id: string | null;
  branch_name?: string;
  branch_ids: string[];
  company_id?: string;
  company_slug: string | null;
  company_status: 'pending' | 'active' | 'suspended';
  company_features: Record<string, boolean>;
  phone: string;
  avatar?: string;
  specialization?: 'THEORY' | 'PRACTICE';
  is_active: boolean;
  created_at: string;
  must_change_password: boolean;
  crm_tour_completed_at: string | null;
  access_version: number;
  /** Faqat ruxsatlari qo'lda sozlangan xodimda — aks holda rol bo'yicha. */
  permissions?: PermissionAssignment[];
  delegations?: PermissionAssignment[];
}

export interface V2AuthResult {
  token: string;
  expiresAt: Date;
  user: V2User;
}

const WRONG_CREDENTIALS = 'Email yoki parol xato';

/** `User` jadvalidan panelga kira oladigan rollar. */
const PANEL_USER_ROLES = new Set<Role>([
  Role.SUPERADMIN,
  Role.ADMIN,
  Role.MANAGEMENT,
  Role.ADMINSTRATOR,
  Role.ACCOUNTANT,
]);

type Account = {
  ref: StaffRef;
  phone: string;
  role: Role;
  fullName: string;
  password: string;
  status: UserStatus;
  organizationId: number | null;
  deleted_at: Date | null;
};

@Injectable()
export class V2AuthService {
  private readonly logger = new Logger(V2AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private sessionService: SessionService,
  ) {}

  async login(
    payload: V2LoginDto,
    context: V2RequestContext = {},
  ): Promise<V2AuthResult> {
    const account = await this.findByEmail(payload.email);

    // Hisob yo'qligi va parol xatoligi tashqaridan bir xil ko'rinadi.
    if (!account || account.deleted_at) {
      throw new UnauthorizedException(WRONG_CREDENTIALS);
    }

    if (!(await comparePassword(payload.password, account.password))) {
      await this.logLogin(account, context, false);
      throw new UnauthorizedException(WRONG_CREDENTIALS);
    }

    if (account.status !== UserStatus.ACTIVE) {
      await this.logLogin(account, context, false);
      throw new ForbiddenException(
        account.status === UserStatus.FREEZE
          ? 'Hisobingiz vaqtincha muzlatilgan. Administratorga murojaat qiling'
          : 'Hisobingiz faol emas. Administratorga murojaat qiling',
      );
    }

    await this.logLogin(account, context, true);

    return this.issue(account, context);
  }

  async me(ref: StaffRef): Promise<V2User> {
    return this.buildUser(ref);
  }

  /** Takror chaqirilsa birinchi vaqt saqlanib qoladi. */
  async completeCrmTour(ref: StaffRef): Promise<V2User> {
    if (ref.kind === 'user') {
      await this.prisma.user.updateMany({
        where: { id: ref.id, crmTourCompletedAt: null },
        data: { crmTourCompletedAt: new Date() },
      });
    }

    return this.buildUser(ref);
  }

  /**
   * Parol almashgach hisobning HAMMA sessiyasi yopiladi va shu qurilma uchun
   * yangisi ochiladi: boshqa qurilmadagi eski sessiya ishlashda davom etmasin.
   */
  async changePassword(
    ref: StaffRef,
    payload: V2ChangePasswordDto,
    context: V2RequestContext = {},
  ): Promise<V2AuthResult> {
    const account = await this.findByRef(ref);

    if (!account) throw new UnauthorizedException();

    if (!(await comparePassword(payload.currentPassword, account.password))) {
      throw new BadRequestException('Joriy parol noto‘g‘ri');
    }

    if (payload.currentPassword === payload.newPassword) {
      throw new BadRequestException(
        'Yangi parol joriy paroldan farq qilishi kerak',
      );
    }

    const password = await hashPassword(payload.newPassword);
    if (ref.kind === 'teacher') {
      await this.prisma.teacher.update({
        where: { id: ref.id },
        data: { password },
      });
    } else {
      await this.prisma.user.update({
        where: { id: ref.id },
        data: { password },
      });
    }
    await this.sessionService.revokeAllForAccount(ref.id, ref.kind);

    return this.issue(account, context);
  }

  /**
   * Chiqish. Imzo tekshiriladi, muddat esa yo'q: tugma ko'pincha aynan token
   * eskirgandan keyin bosiladi va o'shanda ham sessiya yopilishi kerak.
   */
  async logout(token?: string): Promise<void> {
    if (!token) return;

    let sessionId: string | undefined;
    try {
      sessionId = this.jwtService.verify<{ sid?: string }>(token, {
        ignoreExpiration: true,
      })?.sid;
    } catch {
      return;
    }

    if (sessionId) await this.sessionService.revokeSession(sessionId);
  }

  /** Xodim (`User`) avval qidiriladi, topilmasa — o'qituvchi (`Teacher`). */
  private async findByEmail(email: string): Promise<Account | null> {
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });

    if (user) {
      // User jadvalidagi o'qituvchi/o'quvchi roli — ma'lumot xatosi.
      if (!PANEL_USER_ROLES.has(user.role)) return null;
      return {
        ref: { kind: 'user', id: user.id },
        phone: user.phone,
        role: user.role,
        fullName: user.fullName,
        password: user.password,
        status: user.status,
        organizationId: user.organizationId,
        deleted_at: user.deleted_at ?? null,
      };
    }

    const teacher = await this.prisma.teacher.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });

    return teacher
      ? {
          ref: { kind: 'teacher', id: teacher.id },
          phone: teacher.phone,
          role: Role.TEACHER,
          fullName: teacher.fullName,
          password: teacher.password,
          status: teacher.status,
          organizationId: teacher.organizationId,
          deleted_at: teacher.deleted_at ?? null,
        }
      : null;
  }

  private async findByRef(ref: StaffRef): Promise<Account | null> {
    if (ref.kind === 'teacher') {
      const teacher = await this.prisma.teacher.findUnique({
        where: { id: ref.id },
      });
      return teacher
        ? {
            ref,
            phone: teacher.phone,
            role: Role.TEACHER,
            fullName: teacher.fullName,
            password: teacher.password,
            status: teacher.status,
            organizationId: teacher.organizationId,
            deleted_at: teacher.deleted_at ?? null,
          }
        : null;
    }

    const user = await this.prisma.user.findUnique({ where: { id: ref.id } });
    return user
      ? {
          ref,
          phone: user.phone,
          role: user.role,
          fullName: user.fullName,
          password: user.password,
          status: user.status,
          organizationId: user.organizationId,
          deleted_at: user.deleted_at ?? null,
        }
      : null;
  }

  /**
   * Bu frontendda refresh token yo'q: bitta token cookie'da yashaydi.
   * Shuning uchun uning muddati sessiya muddatiga teng qilinadi; bekor
   * qilish baribir `sid` orqali darhol ishlaydi (chiqish, bloklash, parol).
   */
  private async issue(
    account: Account,
    context: V2RequestContext,
  ): Promise<V2AuthResult> {
    const session = await this.sessionService.createSession({
      userId: account.ref.id,
      userType: account.ref.kind,
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
    });

    const token = this.jwtService.sign(
      {
        id: account.ref.id,
        phone: account.phone,
        role: account.role,
        fullName: account.fullName,
        sid: session.sessionId,
      },
      {
        expiresIn: Math.max(
          60,
          Math.floor((session.expiresAt.getTime() - Date.now()) / 1000),
        ),
      },
    );

    return {
      token,
      expiresAt: session.expiresAt,
      user: await this.buildUser(account.ref),
    };
  }

  private async buildUser(ref: StaffRef): Promise<V2User> {
    const profile =
      ref.kind === 'teacher'
        ? await this.teacherProfile(ref.id)
        : await this.userProfile(ref.id);
    if (!profile) throw new UnauthorizedException();

    const branches = profile.organizationId
      ? await this.prisma.branch.findMany({
          where: {
            organizationId: profile.organizationId,
            status: Status.ACTIVE,
          },
          select: { id: true, name: true },
          orderBy: { id: 'asc' },
        })
      : [];

    const access = parseStoredAccess(profile.permissions);
    const customized = profile.accessVersion > 0;
    // Qo'lda sozlangan a'zolik bo'lsa — faqat o'sha filiallar.
    const allowed =
      customized && access.branch_ids.length
        ? branches.filter((branch) =>
            access.branch_ids.includes(toId(branch.id)),
          )
        : branches;

    /*
      Egasi (`owner`), platforma egasi (`dev`) va buxgalter uchun "uy" filiali
      yo'q — ular "Barcha filiallar" ko'rinishida boshlaydi. Qolganlar o'z
      filialidan, u bo'lmasa birinchisidan boshlaydi: frontend
      `branch_ids[0]` ni faol qilib oladi.
    */
    const crossBranch =
      profile.role === 'owner' ||
      profile.role === 'dev' ||
      profile.role === 'accountant';
    const home = crossBranch
      ? undefined
      : (allowed.find((branch) => branch.id === profile.homeBranchId) ??
        allowed[0]);
    const ordered = home
      ? [home, ...allowed.filter((branch) => branch.id !== home.id)]
      : allowed;

    return {
      id: profile.id,
      name: profile.name,
      email: profile.email ?? '',
      role: profile.role,
      branch_id: home ? toId(home.id) : null,
      ...(home ? { branch_name: home.name } : {}),
      branch_ids: ordered.map((branch) => toId(branch.id)),
      ...(profile.organizationId
        ? { company_id: toId(profile.organizationId) }
        : {}),
      company_slug: null,
      company_status:
        !profile.organizationStatus ||
        profile.organizationStatus === Status.ACTIVE
          ? 'active'
          : 'suspended',
      company_features: { company_dashboard_v2: true },
      phone: profile.phone,
      ...(profile.photo ? { avatar: profile.photo } : {}),
      ...(profile.specialization
        ? { specialization: profile.specialization }
        : {}),
      is_active: profile.status === UserStatus.ACTIVE,
      created_at: profile.createdAt.toISOString(),
      must_change_password: false,
      crm_tour_completed_at: profile.crmTourCompletedAt?.toISOString() ?? null,
      access_version: profile.accessVersion,
      ...(customized
        ? { permissions: access.grants, delegations: access.delegations }
        : {}),
    };
  }

  private async userProfile(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        photo: true,
        role: true,
        status: true,
        branchId: true,
        accessVersion: true,
        permissions: true,
        created_at: true,
        crmTourCompletedAt: true,
        organization: { select: { id: true, status: true } },
        managedBranches: {
          where: { status: Status.ACTIVE },
          select: { id: true },
          orderBy: { id: 'asc' },
        },
      },
    });
    const role = user ? toV2Role(user.role) : null;
    if (!user || !role || role === 'teacher') return null;

    return {
      id: toId(user.id),
      name: user.fullName,
      email: user.email,
      phone: user.phone,
      photo: user.photo,
      role,
      status: user.status,
      specialization: undefined,
      homeBranchId: user.branchId ?? user.managedBranches[0]?.id ?? null,
      accessVersion: user.accessVersion ?? 0,
      permissions: user.permissions,
      createdAt: user.created_at,
      crmTourCompletedAt: user.crmTourCompletedAt,
      organizationId: user.organization?.id ?? null,
      organizationStatus: user.organization?.status ?? null,
    };
  }

  private async teacherProfile(id: number) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        photo: true,
        status: true,
        branchId: true,
        specialization: true,
        accessVersion: true,
        permissions: true,
        created_at: true,
        organization: { select: { id: true, status: true } },
      },
    });
    if (!teacher) return null;

    return {
      id: toTeacherId(teacher.id),
      name: teacher.fullName,
      email: teacher.email,
      phone: teacher.phone,
      photo: teacher.photo,
      role: 'teacher' as const,
      status: teacher.status,
      specialization: (teacher.specialization === 'PRACTICE'
        ? 'PRACTICE'
        : 'THEORY') as 'THEORY' | 'PRACTICE',
      homeBranchId: teacher.branchId,
      accessVersion: teacher.accessVersion ?? 0,
      permissions: teacher.permissions,
      createdAt: teacher.created_at,
      crmTourCompletedAt: null,
      organizationId: teacher.organization?.id ?? null,
      organizationStatus: teacher.organization?.status ?? null,
    };
  }

  private async logLogin(
    account: Account,
    context: V2RequestContext,
    success: boolean,
  ): Promise<void> {
    try {
      await this.prisma.loginLog.create({
        data: {
          userPhone: account.phone,
          ipAddress: context.ipAddress || '',
          userAgent: context.userAgent?.slice(0, 255) || null,
          loginType: account.ref.kind,
          success,
          organizationId: account.organizationId,
        },
      });
    } catch (error) {
      this.logger.error(
        `Kirish urinishini yozib bo'lmadi: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
