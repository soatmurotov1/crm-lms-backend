import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, UserStatus } from '@prisma/client';
import { comparePassword, hashPassword } from 'src/common/bcrypt/bcrypt';
import { PrismaService } from 'src/common/prisma/prisma.service';
import {
  accountLockout,
  burnPasswordCheck,
} from 'src/common/utils/account-lockout';
import { SessionService } from 'src/common/session/session.service';
import { iso, toId } from '../common/v2.mapper';
import type { V2RequestContext } from '../auth/v2-auth.service';
import {
  parseLearnerPortal,
  type LearnerPortalSettings,
} from './learner-portal.settings';

const WRONG_CREDENTIALS = 'Telefon raqam yoki parol xato';

export interface LearnerProfile {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  phone: string;
  email: string | null;
  branch_name: string | null;
  organization_name: string | null;
  created_at: string | null;
  portal: LearnerPortalSettings;
}

export interface LearnerAuthResult {
  token: string;
  expiresAt: Date;
  user: LearnerProfile;
}

/** Telefonni bazadagi ko'rinishlardan biriga moslash: `+998...` yoki raqamlar. */
function phoneVariants(raw: string): string[] {
  const digits = raw.replace(/\D/g, '');
  const full = digits.length === 9 ? `998${digits}` : digits;
  return [...new Set([raw.trim(), `+${full}`, full])];
}

@Injectable()
export class LearnerAuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private sessionService: SessionService,
  ) {}

  async login(
    phone: string,
    password: string,
    context: V2RequestContext = {},
  ): Promise<LearnerAuthResult> {
    const lockKey = `learner:${phone.replace(/\D/g, '').slice(-9)}`;
    accountLockout.assertNotLocked(lockKey);

    const student = await this.prisma.student.findFirst({
      where: { phone: { in: phoneVariants(phone) }, deleted_at: null },
      include: { organization: { select: { learnerPortal: true } } },
    });

    if (!student || !student.hasLearnerAccount) {
      await burnPasswordCheck(password);
      accountLockout.recordFailure(lockKey);
      throw new UnauthorizedException(WRONG_CREDENTIALS);
    }
    if (!(await comparePassword(password, student.password))) {
      accountLockout.recordFailure(lockKey);
      throw new UnauthorizedException(WRONG_CREDENTIALS);
    }
    accountLockout.recordSuccess(lockKey);
    if (student.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException(
        'Hisobingiz faol emas. O‘quv markaziga murojaat qiling',
      );
    }
    if (!parseLearnerPortal(student.organization?.learnerPortal).enabled) {
      throw new ForbiddenException('O‘quvchi kabineti vaqtincha yopilgan');
    }

    const session = await this.sessionService.createSession({
      userId: student.id,
      userType: 'student',
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
    });
    const token = this.jwtService.sign(
      {
        id: student.id,
        phone: student.phone,
        role: Role.STUDENT,
        fullName: student.fullName,
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
      user: await this.profile(student.id),
    };
  }

  async profile(id: number): Promise<LearnerProfile> {
    const row = await this.prisma.student.findUnique({
      where: { id },
      include: {
        branch: { select: { name: true } },
        organization: { select: { name: true, learnerPortal: true } },
      },
    });
    if (!row) throw new UnauthorizedException();

    return {
      id: toId(row.id),
      full_name: row.fullName,
      first_name: row.firstName,
      last_name: row.lastName,
      phone: row.phone,
      email: row.email,
      branch_name: row.branch?.name ?? null,
      organization_name: row.organization?.name ?? null,
      created_at: iso(row.created_at),
      portal: parseLearnerPortal(row.organization?.learnerPortal),
    };
  }

  async changePassword(id: number, current: string, next: string) {
    const row = await this.prisma.student.findUnique({ where: { id } });
    if (!row) throw new UnauthorizedException();
    if (!(await comparePassword(current, row.password))) {
      throw new BadRequestException('Joriy parol noto‘g‘ri');
    }
    if (current === next) {
      throw new BadRequestException(
        'Yangi parol joriy paroldan farq qilishi kerak',
      );
    }
    await this.prisma.student.update({
      where: { id },
      data: { password: await hashPassword(next) },
    });
  }

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
}
