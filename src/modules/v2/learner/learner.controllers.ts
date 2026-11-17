import {
  Body,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import {
  LoginThrottleGuard,
  SkipLoginThrottle,
} from 'src/common/guard/login-throttle.guard';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { getClientIp } from 'src/common/utils/client-ip.util';
import { V2AuditService } from '../common/v2-audit.service';
import {
  CurrentActor,
  V2AuthGuard,
  V2Roles,
  type V2Actor,
} from '../common/v2-auth.guard';
import { V2Controller } from '../common/v2-controller.decorator';
import {
  V2_LEARNER_COOKIE,
  clearLearnerCookie,
  readCookie,
  setLearnerCookie,
} from '../common/v2-cookie';
import { parseId } from '../common/v2.mapper';
import { LearnerAuthService } from './learner-auth.service';
import {
  CurrentLearner,
  LearnerGuard,
  LearnerSectionOf,
  type Learner,
} from './learner.guard';
import {
  parseLearnerPortal,
  type LearnerPortalSettings,
} from './learner-portal.settings';
import {
  LearnerChangePasswordDto,
  LearnerLoginDto,
  LearnerQuizAttemptDto,
  LearnerScheduleQueryDto,
  LearnerSubmitAssignmentDto,
  UpdateLearnerPortalDto,
} from './learner.dto';
import { LearnerService } from './learner.service';

const requestContext = (request: Request) => ({
  ipAddress: getClientIp(request),
  userAgent: request.headers['user-agent'],
});

/** O'quvchi kabinetiga kirish: telefon + parol (paroldni markaz o'rnatadi). */
@V2Controller('learner/auth')
@UseGuards(LoginThrottleGuard)
export class LearnerAuthController {
  constructor(private readonly auth: LearnerAuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'O‘quvchi kirishi (telefon va parol)' })
  async login(
    @Body() payload: LearnerLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(
      payload.phone,
      payload.password,
      requestContext(request),
    );
    setLearnerCookie(response, result.token, result.expiresAt);
    return { data: { token: result.token, user: result.user } };
  }

  @Get('me')
  @SkipLoginThrottle()
  @UseGuards(LearnerGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Joriy o‘quvchi va kabinet sozlamalari' })
  async me(@CurrentLearner() learner: Learner) {
    return { data: await this.auth.profile(learner.id) };
  }

  @Post('change-password')
  @HttpCode(204)
  @UseGuards(LearnerGuard)
  @ApiBearerAuth()
  async changePassword(
    @CurrentLearner() learner: Learner,
    @Body() payload: LearnerChangePasswordDto,
  ): Promise<void> {
    await this.auth.changePassword(
      learner.id,
      payload.currentPassword,
      payload.newPassword,
    );
  }

  @Post('logout')
  @HttpCode(204)
  @SkipLoginThrottle()
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const [scheme, bearer] = (request.headers.authorization || '').split(' ');
    await this.auth.logout(
      scheme === 'Bearer' && bearer
        ? bearer
        : readCookie(request.headers.cookie, V2_LEARNER_COOKIE),
    );
    clearLearnerCookie(response);
  }
}

/** O'quvchining o'z ma'lumotlari. Har bir bo'limni markaz egasi o'chira oladi. */
@V2Controller('learner')
@UseGuards(LearnerGuard)
@ApiBearerAuth()
export class LearnerController {
  constructor(private readonly learner: LearnerService) {}

  @Get('dashboard')
  dashboard(@CurrentLearner() me: Learner) {
    return this.learner.dashboard(me);
  }

  @Get('groups')
  @LearnerSectionOf('schedule')
  groups(@CurrentLearner() me: Learner) {
    return this.learner.groups(me);
  }

  @Get('schedule')
  @LearnerSectionOf('schedule')
  schedule(
    @CurrentLearner() me: Learner,
    @Query() query: LearnerScheduleQueryDto,
  ) {
    return this.learner.schedule(me, query.date_from, query.date_to);
  }

  @Get('courses')
  @LearnerSectionOf('courses')
  courses(@CurrentLearner() me: Learner) {
    return this.learner.courses(me);
  }

  @Get('courses/:id')
  @LearnerSectionOf('courses')
  course(@CurrentLearner() me: Learner, @Param('id') id: string) {
    return this.learner.course(me, parseId(id, 'Kurs'));
  }

  @Post('lessons/:id/progress')
  @LearnerSectionOf('courses')
  progress(
    @CurrentLearner() me: Learner,
    @Param('id') id: string,
    @Body() body: { completed?: boolean },
  ) {
    return this.learner.completeLesson(
      me,
      parseId(id, 'Dars'),
      body?.completed !== false,
    );
  }

  @Get('materials/:id/download')
  @LearnerSectionOf('courses')
  download(@CurrentLearner() me: Learner, @Param('id') id: string) {
    return this.learner.downloadMaterial(me, parseId(id, 'Material'));
  }

  @Get('assignments')
  @LearnerSectionOf('assignments')
  assignments(@CurrentLearner() me: Learner) {
    return this.learner.assignments(me);
  }

  @Post('assignments/:id/submit')
  @LearnerSectionOf('assignments')
  submit(
    @CurrentLearner() me: Learner,
    @Param('id') id: string,
    @Body() payload: LearnerSubmitAssignmentDto,
  ) {
    return this.learner.submitAssignment(
      me,
      parseId(id, 'Topshiriq'),
      payload.text,
    );
  }

  @Get('quizzes')
  @LearnerSectionOf('quizzes')
  quizzes(@CurrentLearner() me: Learner) {
    return this.learner.quizzes(me);
  }

  @Get('quizzes/:id')
  @LearnerSectionOf('quizzes')
  quiz(@CurrentLearner() me: Learner, @Param('id') id: string) {
    return this.learner.quiz(me, parseId(id, 'Test'));
  }

  @Post('quizzes/:id/attempts')
  @LearnerSectionOf('quizzes')
  attempt(
    @CurrentLearner() me: Learner,
    @Param('id') id: string,
    @Body() payload: LearnerQuizAttemptDto,
  ) {
    return this.learner.submitQuiz(me, parseId(id, 'Test'), payload.answers);
  }

  @Get('grades')
  @LearnerSectionOf('grades')
  grades(@CurrentLearner() me: Learner) {
    return this.learner.grades(me);
  }

  @Get('attendance')
  @LearnerSectionOf('attendance')
  attendance(@CurrentLearner() me: Learner) {
    return this.learner.attendance(me);
  }

  @Get('payments')
  @LearnerSectionOf('payments')
  payments(@CurrentLearner() me: Learner) {
    return this.learner.payments(me);
  }

  @Get('notifications')
  @LearnerSectionOf('notifications')
  notifications(@CurrentLearner() me: Learner) {
    return this.learner.notifications(me);
  }

  @Post('notifications/read-all')
  @HttpCode(200)
  @LearnerSectionOf('notifications')
  readAll(@CurrentLearner() me: Learner) {
    return this.learner.markRead(me);
  }

  @Post('notifications/:id/read')
  @HttpCode(200)
  @LearnerSectionOf('notifications')
  read(@CurrentLearner() me: Learner, @Param('id') id: string) {
    return this.learner.markRead(me, parseId(id, 'Bildirishnoma'));
  }
}

/** Markaz egasi o'quvchi kabinetining qaysi bo'limlari ochiq bo'lishini sozlaydi. */
@V2Controller('settings/learner-portal')
@UseGuards(V2AuthGuard)
@ApiBearerAuth()
export class LearnerPortalSettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: V2AuditService,
  ) {}

  private async orgId(actor: V2Actor): Promise<number> {
    if (actor.organizationId) return actor.organizationId;
    // `dev` (superadmin) tashkilotsiz bo'lishi mumkin — birinchisini sozlaydi.
    const first = await this.prisma.organization.findFirst({
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    if (!first) throw new ForbiddenException('Tashkilot topilmadi');
    return first.id;
  }

  @Get()
  @ApiOperation({ summary: 'O‘quvchi kabineti sozlamalari' })
  async get(
    @CurrentActor() actor: V2Actor,
  ): Promise<{ data: LearnerPortalSettings }> {
    const org = await this.prisma.organization.findUnique({
      where: { id: await this.orgId(actor) },
      select: { learnerPortal: true },
    });
    return { data: parseLearnerPortal(org?.learnerPortal) };
  }

  @Patch()
  @V2Roles('dev', 'owner')
  @ApiOperation({ summary: 'O‘quvchi kabineti bo‘limlarini yoqish/o‘chirish' })
  async update(
    @CurrentActor() actor: V2Actor,
    @Body() payload: UpdateLearnerPortalDto,
  ): Promise<{ data: LearnerPortalSettings }> {
    const id = await this.orgId(actor);
    const org = await this.prisma.organization.findUnique({
      where: { id },
      select: { learnerPortal: true },
    });
    const next = parseLearnerPortal({
      ...parseLearnerPortal(org?.learnerPortal),
      ...payload,
    } as Prisma.JsonObject);
    await this.prisma.organization.update({
      where: { id },
      data: { learnerPortal: next as unknown as Prisma.InputJsonValue },
    });
    await this.audit.record(actor, 'UPDATE', 'learner_portal', id, {
      organizationId: id,
      changes: payload as Record<string, unknown>,
    });
    return { data: next };
  }
}

export const LEARNER_CONTROLLERS = [
  LearnerAuthController,
  LearnerController,
  LearnerPortalSettingsController,
];
