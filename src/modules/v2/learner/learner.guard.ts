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
import { Role } from '@prisma/client';
import { AuthGuard } from 'src/common/guard/jwt-auth.guard';
import type { AuthedRequest } from 'src/common/guard/current-user.decorator';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { SessionService } from 'src/common/session/session.service';
import { V2_LEARNER_COOKIE, readCookie } from '../common/v2-cookie';
import {
  parseLearnerPortal,
  type LearnerPortalSettings,
  type LearnerSection,
} from './learner-portal.settings';

/** Kabinetga kirgan o'quvchi. */
export interface Learner {
  id: number;
  fullName: string;
  organizationId: number;
  branchId: number | null;
  settings: LearnerPortalSettings;
}

interface LearnerRequest extends AuthedRequest {
  learner?: Learner;
}

const SECTION_KEY = 'learner:section';

/** Endpoint qaysi bo'limga tegishli — egasi o'chirgan bo'lsa 403. */
export const LearnerSectionOf = (section: LearnerSection) =>
  SetMetadata(SECTION_KEY, section);

/**
 * O'quvchi kabineti uchun kirish tekshiruvi. Token `Authorization` yoki
 * alohida `learner_session` cookie'sida keladi; sessiya `student` turida
 * bo'lishi shart (asosiy guard jadvalni sessiyadan aniqlaydi).
 */
@Injectable()
export class LearnerGuard extends AuthGuard {
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
      readCookie(req.headers.cookie, V2_LEARNER_COOKIE)
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);
    const req = context.switchToHttp().getRequest<LearnerRequest>();

    if (req.user?.role !== Role.STUDENT) {
      throw new ForbiddenException('Bu bo‘lim faqat o‘quvchilar uchun');
    }

    const student = await this.prisma.student.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        fullName: true,
        organizationId: true,
        branchId: true,
        deleted_at: true,
        hasLearnerAccount: true,
        organization: { select: { learnerPortal: true } },
      },
    });
    if (
      !student ||
      student.deleted_at ||
      !student.hasLearnerAccount ||
      !student.organizationId
    ) {
      throw new UnauthorizedException();
    }

    const settings = parseLearnerPortal(student.organization?.learnerPortal);
    if (!settings.enabled) {
      throw new ForbiddenException('O‘quvchi kabineti vaqtincha yopilgan');
    }

    const section = this.reflector.getAllAndOverride<
      LearnerSection | undefined
    >(SECTION_KEY, [context.getHandler(), context.getClass()]);
    if (section && !settings[section]) {
      throw new ForbiddenException('Bu bo‘lim markaz tomonidan o‘chirilgan');
    }

    req.learner = {
      id: student.id,
      fullName: student.fullName,
      organizationId: student.organizationId,
      branchId: student.branchId,
      settings,
    };
    return true;
  }
}

export const CurrentLearner = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Learner => {
    const learner = context.switchToHttp().getRequest<LearnerRequest>().learner;
    if (!learner) throw new UnauthorizedException();
    return learner;
  },
);
