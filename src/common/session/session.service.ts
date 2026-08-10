import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/** Hisoblar uch xil jadvalda: sessiya qaysinisiga tegishli ekani. */
export type SessionUserType = 'user' | 'teacher' | 'student';

export interface IssuedSession {
  sessionId: string;
  refreshToken: string;
  expiresAt: Date;
}

/**
 * Refresh token muddati. Access token 2 soat yashaydi, refresh esa 30 kun:
 * har kuni ishlatadigan o'qituvchi umuman qayta login qilmaydi, tashlab
 * ketilgan qurilmadagi sessiya esa o'zi o'ladi.
 */
const REFRESH_TOKEN_TTL_MS =
  Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30) * 24 * 60 * 60 * 1000;

/**
 * Bitta hisob uchun ochiq sessiyalar chegarasi. Cheklanmasa, har login yangi
 * qator qoldirib ketaveradi va jadval o'sib boradi.
 */
const MAX_SESSIONS_PER_ACCOUNT = 10;

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Refresh token ko'rinishi: `<sessionId>.<sirli qism>`.
   *
   * sessionId ochiq yuriladi, chunki u bilan hech narsa qilib bo'lmaydi —
   * bazada esa butun tokenning sha256 hash'i saqlanadi. Shuning uchun qatorni
   * sessionId bo'yicha topib, hash'ni solishtirish mumkin: aynan shu
   * "topildi-yu mos kelmadi" holati o'g'irlangan tokenni fosh qiladi.
   */
  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private hashesMatch(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);

    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  }

  /** Yangi sessiya ochadi va refresh tokenni FAQAT shu yerda ochiq qaytaradi. */
  async createSession(params: {
    userId: number;
    userType: SessionUserType;
    userAgent?: string;
    ipAddress?: string;
  }): Promise<IssuedSession> {
    const sessionId = randomBytes(16).toString('hex');
    const refreshToken = `${sessionId}.${randomBytes(48).toString('base64url')}`;
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await this.prisma.refreshToken.create({
      data: {
        sessionId,
        token: this.hash(refreshToken),
        userId: params.userId,
        userType: params.userType,
        expiresAt,
        userAgent: params.userAgent?.slice(0, 255) || null,
        ipAddress: params.ipAddress || null,
      },
    });

    await this.pruneOldestSessions(params.userId, params.userType);

    return { sessionId, refreshToken, expiresAt };
  }

  /**
   * Refresh tokenni tekshirib, yangisiga almashtiradi (rotation).
   *
   * Sessiya o'zgarmaydi — faqat token qiymati yangilanadi. Shu sababli
   * foydalanuvchining boshqa qurilmalari va `sid` yozilgan access tokenlar
   * ta'sirlanmaydi.
   */
  async rotate(
    refreshToken: string,
    context: { userAgent?: string; ipAddress?: string } = {},
  ): Promise<{
    sessionId: string;
    userId: number;
    userType: SessionUserType;
    refreshToken: string;
    expiresAt: Date;
  }> {
    const [sessionId] = String(refreshToken || '').split('.');

    if (!sessionId) {
      throw new UnauthorizedException('Sessiya yaroqsiz');
    }

    const record = await this.prisma.refreshToken.findUnique({
      where: { sessionId },
    });

    if (
      !record ||
      record.revokedAt ||
      record.expiresAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedException('Sessiya muddati tugagan');
    }

    /*
      Sessiya bor, lekin token mos emas — demak ishlatilgan (almashtirilgan)
      eski token qayta keldi. Bu deyarli har doim o'g'irlangan token belgisi,
      shuning uchun sessiyani butunlay yopamiz: haqiqiy egasi ham, o'g'ri ham
      qaytadan parol bilan kiradi.
    */
    if (!this.hashesMatch(record.token, this.hash(refreshToken))) {
      await this.prisma.refreshToken.update({
        where: { sessionId },
        data: { revokedAt: new Date() },
      });

      this.logger.warn(
        `Ishlatilgan refresh token qayta keldi, sessiya yopildi: ${sessionId}`,
      );

      throw new UnauthorizedException('Sessiya bekor qilindi');
    }

    const nextToken = `${sessionId}.${randomBytes(48).toString('base64url')}`;
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await this.prisma.refreshToken.update({
      where: { sessionId },
      data: {
        token: this.hash(nextToken),
        expiresAt,
        lastUsedAt: new Date(),
        userAgent: context.userAgent?.slice(0, 255) || record.userAgent,
        ipAddress: context.ipAddress || record.ipAddress,
      },
    });

    return {
      sessionId,
      userId: record.userId,
      userType: record.userType as SessionUserType,
      refreshToken: nextToken,
      expiresAt,
    };
  }

  /**
   * Ochiq sessiya ma'lumoti. AuthGuard har so'rovda shuni so'raydi: shuning
   * uchun chiqish yoki bloklash keyingi so'rovdayoq biladi, tokenning `exp`
   * vaqti kutilmaydi.
   *
   * `userType` ham qaytadi — hisob qaysi jadvaldan ekanini SESSIYA aytadi,
   * tokendagi rol emas. Bu muhim: rol va jadval bir-biriga har doim ham mos
   * kelavermaydi, ID hisoblagichlari esa uchala jadvalda alohida.
   */
  async getActiveSession(sessionId: string): Promise<{
    userId: number;
    userType: SessionUserType;
  } | null> {
    if (!sessionId) return null;

    const session = await this.prisma.refreshToken.findUnique({
      where: { sessionId },
      select: {
        userId: true,
        userType: true,
        revokedAt: true,
        expiresAt: true,
      },
    });

    if (!session) return null;
    if (session.revokedAt) return null;
    if (session.expiresAt.getTime() < Date.now()) return null;

    return {
      userId: session.userId,
      userType: session.userType as SessionUserType,
    };
  }

  /** Bitta qurilmadan chiqish. */
  async revokeSession(sessionId: string): Promise<void> {
    if (!sessionId) return;

    await this.prisma.refreshToken.updateMany({
      where: { sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Chiqishda access token bo'lmasa ham refresh token bo'yicha yopish. */
  async revokeByRefreshToken(refreshToken: string): Promise<void> {
    const [sessionId] = String(refreshToken || '').split('.');
    await this.revokeSession(sessionId);
  }

  /**
   * Hisobning hamma sessiyalari. Parol almashganda, raqam almashganda va
   * "hamma qurilmadan chiqish" bosilganda chaqiriladi.
   */
  async revokeAllForAccount(
    userId: number,
    userType: SessionUserType,
  ): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, userType, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return result.count;
  }

  /** Chegaradan oshgan eng eski sessiyalarni yopadi. */
  private async pruneOldestSessions(
    userId: number,
    userType: SessionUserType,
  ): Promise<void> {
    const active = await this.prisma.refreshToken.findMany({
      where: { userId, userType, revokedAt: null },
      orderBy: { created_at: 'desc' },
      select: { id: true },
      skip: MAX_SESSIONS_PER_ACCOUNT,
    });

    if (!active.length) return;

    await this.prisma.refreshToken.updateMany({
      where: { id: { in: active.map((session) => session.id) } },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Muddati tugagan va bekor qilingan qatorlar jadvalda qolib ketmasin.
   * Bekor qilinganlar darhol emas, 7 kundan keyin o'chadi — shu muddat ichida
   * qayta ishlatishga urinish loglarda ko'rinib turadi.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupExpiredSessions(): Promise<void> {
    const revokedCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    try {
      const result = await this.prisma.refreshToken.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: new Date() } },
            { revokedAt: { lt: revokedCutoff } },
          ],
        },
      });

      if (result.count) {
        this.logger.log(`${result.count} ta eskirgan sessiya tozalandi`);
      }
    } catch (error) {
      this.logger.error(
        `Sessiyalarni tozalashda xato: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
