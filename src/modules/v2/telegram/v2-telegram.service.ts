import {
  BadRequestException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ExpenseStatus, PaymentStatus, Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { isSchedulerProcess } from 'src/common/utils/scheduler.util';
import {
  addDays,
  tashkentDateKey,
  tashkentDayStart,
} from 'src/common/utils/tashkent-time.util';
import type { V2Actor } from '../common/v2-auth.guard';
import { parseStaffId } from '../common/v2.mapper';

/** Bog'lash havolasi shuncha vaqt amal qiladi. */
const LINK_TOKEN_TTL_MS = 15 * 60 * 1000;
/** Xarajatlar dayjesti "keyinroq" bosilsa — shuncha kun jim turadi. */
const SNOOZE_DAYS = 7;
const POLL_TIMEOUT_S = 25;
const API = 'https://api.telegram.org';

interface TelegramUpdate {
  update_id: number;
  message?: {
    chat: { id: number };
    text?: string;
  };
}

const money = (value: Prisma.Decimal | number | null | undefined) =>
  new Prisma.Decimal(value ?? 0)
    .toFixed(0)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/**
 * Telegram bot: xodim profilini botga bog'lash, kunlik hisobot va
 * xarajatlar dayjesti.
 *
 * `TELEGRAM_BOT_TOKEN` berilmasa bot o'chiq turadi — endpointlar ishlaydi,
 * lekin bog'lash havolasi berilmaydi. Webhook o'rniga long-polling
 * ishlatiladi: server ochiq domen talab qilmaydi. Polling faqat scheduler
 * process'da ishlaydi (cluster'da bitta nusxa).
 */
@Injectable()
export class V2TelegramService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(V2TelegramService.name);
  private readonly token = process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
  private readonly username =
    process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '') || '';
  private polling = false;
  private offset = 0;
  private abort?: AbortController;

  constructor(private prisma: PrismaService) {}

  get configured(): boolean {
    return Boolean(this.token && this.username);
  }

  onApplicationBootstrap() {
    if (!this.token) {
      this.logger.log('TELEGRAM_BOT_TOKEN sozlanmagan — Telegram bot o‘chiq');
      return;
    }
    if (!isSchedulerProcess()) return;
    this.polling = true;
    void this.pollLoop();
  }

  onModuleDestroy() {
    this.polling = false;
    this.abort?.abort();
  }

  // --- Profil endpointlari ---------------------------------------------------

  async status(actor: V2Actor) {
    const link = await this.prisma.telegramLink.findUnique({
      where: { actorId: actor.id },
    });
    return {
      data: {
        linked: Boolean(link?.chatId),
        daily_report_enabled: Boolean(link?.chatId && link.dailyReport),
        expense_digest_enabled: Boolean(link?.chatId && link.expenseDigest),
        expense_digest_snoozed_until: link?.digestSnoozedUntil?.toISOString() ?? null,
        bot_configured: this.configured,
      },
    };
  }

  async linkToken(actor: V2Actor) {
    if (!this.configured) {
      throw new ServiceUnavailableException(
        'Telegram bot sozlanmagan. Administrator TELEGRAM_BOT_TOKEN va TELEGRAM_BOT_USERNAME ni kiritishi kerak',
      );
    }
    const token = randomBytes(16).toString('hex');
    await this.prisma.telegramLink.upsert({
      where: { actorId: actor.id },
      update: {
        linkToken: token,
        linkTokenExpiresAt: new Date(Date.now() + LINK_TOKEN_TTL_MS),
      },
      create: {
        actorId: actor.id,
        linkToken: token,
        linkTokenExpiresAt: new Date(Date.now() + LINK_TOKEN_TTL_MS),
      },
    });
    return {
      data: { deep_link: `https://t.me/${this.username}?start=${token}` },
    };
  }

  async unlink(actor: V2Actor): Promise<void> {
    const link = await this.prisma.telegramLink.findUnique({
      where: { actorId: actor.id },
    });
    if (!link) return;
    await this.prisma.telegramLink.update({
      where: { id: link.id },
      data: {
        chatId: null,
        linkToken: null,
        linkTokenExpiresAt: null,
        dailyReport: false,
        expenseDigest: false,
        digestSnoozedUntil: null,
      },
    });
    if (link.chatId) {
      await this.send(link.chatId, 'EduCRM profilingiz bu chatdan uzildi.');
    }
  }

  async setDailyReport(actor: V2Actor, enabled: boolean) {
    await this.requireLinked(actor);
    await this.prisma.telegramLink.update({
      where: { actorId: actor.id },
      data: { dailyReport: enabled },
    });
    return this.status(actor);
  }

  async setExpenseDigest(actor: V2Actor, enabled: boolean) {
    await this.requireLinked(actor);
    await this.prisma.telegramLink.update({
      where: { actorId: actor.id },
      data: { expenseDigest: enabled, ...(enabled ? {} : { digestSnoozedUntil: null }) },
    });
    return this.status(actor);
  }

  async snoozeDigest(actor: V2Actor) {
    await this.requireLinked(actor);
    await this.prisma.telegramLink.update({
      where: { actorId: actor.id },
      data: {
        digestSnoozedUntil: new Date(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000),
      },
    });
    return this.status(actor);
  }

  private async requireLinked(actor: V2Actor) {
    const link = await this.prisma.telegramLink.findUnique({
      where: { actorId: actor.id },
    });
    if (!link?.chatId) {
      throw new BadRequestException('Avval Telegram hisobingizni bog‘lang');
    }
    return link;
  }

  // --- Rejali xabarlar -------------------------------------------------------

  /** Har kuni 20:00 (Toshkent) — kun yakuni. */
  @Cron('0 15 * * *', { timeZone: 'UTC' })
  async sendDailyReports() {
    if (!this.token) return;
    const links = await this.prisma.telegramLink.findMany({
      where: { dailyReport: true, chatId: { not: null } },
    });
    for (const link of links) {
      try {
        const organizationId = await this.organizationOf(link.actorId);
        if (!organizationId) continue;
        await this.send(link.chatId!, await this.dailyReportText(organizationId));
      } catch (error) {
        this.logger.warn(
          `Kunlik hisobot yuborilmadi (${link.actorId}): ${String(error)}`,
        );
      }
    }
  }

  /** Har kuni 09:00 (Toshkent) — muddati yaqin va o'tgan xarajatlar. */
  @Cron('0 4 * * *', { timeZone: 'UTC' })
  async sendExpenseDigests() {
    if (!this.token) return;
    const now = new Date();
    const links = await this.prisma.telegramLink.findMany({
      where: {
        expenseDigest: true,
        chatId: { not: null },
        OR: [{ digestSnoozedUntil: null }, { digestSnoozedUntil: { lt: now } }],
      },
    });
    for (const link of links) {
      try {
        const organizationId = await this.organizationOf(link.actorId);
        if (!organizationId) continue;
        const text = await this.expenseDigestText(organizationId);
        if (text) await this.send(link.chatId!, text);
      } catch (error) {
        this.logger.warn(
          `Xarajatlar dayjesti yuborilmadi (${link.actorId}): ${String(error)}`,
        );
      }
    }
  }

  async dailyReportText(organizationId: number): Promise<string> {
    const today = tashkentDateKey(new Date());
    const range = {
      gte: tashkentDayStart(today),
      lt: tashkentDayStart(addDays(today, 1)),
    };
    const [payments, students, leads, expenses] = await Promise.all([
      this.prisma.payment.aggregate({
        where: {
          status: PaymentStatus.PAID,
          student: { organizationId },
          created_at: range,
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.student.count({
        where: { organizationId, deleted_at: null, created_at: range },
      }),
      this.prisma.lead.count({
        where: { organizationId, deleted_at: null, created_at: range },
      }),
      this.prisma.expensePayment.aggregate({
        where: {
          voidedAt: null,
          date: range,
          expense: { organizationId },
        },
        _sum: { amount: true },
      }),
    ]);

    return [
      `📊 EduCRM — kun yakuni (${today})`,
      '',
      `💰 To'lovlar: ${money(payments._sum.amount)} so'm (${payments._count} ta)`,
      `🎓 Yangi o'quvchilar: ${students}`,
      `📥 Yangi lidlar: ${leads}`,
      `💸 Xarajatlarga to'langan: ${money(expenses._sum.amount)} so'm`,
    ].join('\n');
  }

  async expenseDigestText(organizationId: number): Promise<string | null> {
    const today = tashkentDateKey(new Date());
    const open = {
      organizationId,
      deleted_at: null,
      status: { in: [ExpenseStatus.PENDING, ExpenseStatus.PARTIALLY_PAID] },
    };
    const [overdue, soon] = await Promise.all([
      this.prisma.expense.findMany({
        where: { ...open, dueDate: { lt: tashkentDayStart(today) } },
        select: { title: true, amount: true, paidAmount: true },
        orderBy: { dueDate: 'asc' },
        take: 10,
      }),
      this.prisma.expense.findMany({
        where: {
          ...open,
          dueDate: {
            gte: tashkentDayStart(today),
            lt: tashkentDayStart(addDays(today, 4)),
          },
        },
        select: { title: true, amount: true, paidAmount: true },
        orderBy: { dueDate: 'asc' },
        take: 10,
      }),
    ]);
    if (!overdue.length && !soon.length) return null;

    const line = (row: { title: string; amount: Prisma.Decimal; paidAmount: Prisma.Decimal }) =>
      `• ${row.title} — ${money(new Prisma.Decimal(row.amount).minus(row.paidAmount))} so'm`;
    return [
      '🧾 EduCRM — xarajatlar dayjesti',
      ...(overdue.length ? ['', `⚠️ Muddati o'tgan (${overdue.length}):`, ...overdue.map(line)] : []),
      ...(soon.length ? ['', `⏰ 3 kun ichida (${soon.length}):`, ...soon.map(line)] : []),
    ].join('\n');
  }

  private async organizationOf(actorId: string): Promise<number | null> {
    const ref = parseStaffId(actorId);
    if (!ref) return null;
    const row =
      ref.kind === 'teacher'
        ? await this.prisma.teacher.findUnique({
            where: { id: ref.id },
            select: { organizationId: true, deleted_at: true },
          })
        : await this.prisma.user.findUnique({
            where: { id: ref.id },
            select: { organizationId: true, deleted_at: true },
          });
    return row && !row.deleted_at ? row.organizationId : null;
  }

  // --- Bot API ---------------------------------------------------------------

  private async pollLoop() {
    this.logger.log(`Telegram bot @${this.username || '?'} ishga tushdi (long-polling)`);
    while (this.polling) {
      try {
        const updates = await this.call<TelegramUpdate[]>('getUpdates', {
          offset: this.offset,
          timeout: POLL_TIMEOUT_S,
          allowed_updates: ['message'],
        });
        for (const update of updates ?? []) {
          this.offset = update.update_id + 1;
          await this.handle(update).catch((error) =>
            this.logger.warn(`Xabar qayta ishlanmadi: ${String(error)}`),
          );
        }
      } catch (error) {
        if (!this.polling) return;
        this.logger.warn(`getUpdates xatosi: ${String(error)}`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  private async handle(update: TelegramUpdate) {
    const message = update.message;
    const text = message?.text?.trim();
    if (!message || !text) return;
    const chatId = String(message.chat.id);

    const start = /^\/start(?:@\w+)?\s+([a-f0-9]{32})$/i.exec(text);
    if (start) {
      const link = await this.prisma.telegramLink.findUnique({
        where: { linkToken: start[1] },
      });
      if (!link || !link.linkTokenExpiresAt || link.linkTokenExpiresAt < new Date()) {
        await this.send(
          chatId,
          "Havola eskirgan yoki noto'g'ri. EduCRM profilingizdan qaytadan bog'lang.",
        );
        return;
      }
      // Bitta chat faqat bitta profilga bog'lanadi.
      await this.prisma.telegramLink.updateMany({
        where: { chatId, NOT: { id: link.id } },
        data: { chatId: null, dailyReport: false, expenseDigest: false },
      });
      await this.prisma.telegramLink.update({
        where: { id: link.id },
        data: { chatId, linkToken: null, linkTokenExpiresAt: null },
      });
      await this.send(
        chatId,
        "✅ EduCRM profilingiz bog'landi. Hisobotlarni profil sahifasida yoqishingiz mumkin.",
      );
      return;
    }

    if (/^\/stop/i.test(text)) {
      await this.prisma.telegramLink.updateMany({
        where: { chatId },
        data: { chatId: null, dailyReport: false, expenseDigest: false },
      });
      await this.send(chatId, 'Profil uzildi. Xabarlar endi yuborilmaydi.');
      return;
    }

    await this.send(
      chatId,
      "Salom! Bu EduCRM boti. Profilingizni bog'lash uchun EduCRM → Profil → Telegram bo'limidagi tugmani bosing.",
    );
  }

  async send(chatId: string, text: string) {
    if (!this.token) return;
    await this.call('sendMessage', { chat_id: chatId, text });
  }

  private async call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
    this.abort = new AbortController();
    const response = await fetch(`${API}/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: this.abort.signal,
    });
    const json = (await response.json()) as { ok: boolean; result: T; description?: string };
    if (!json.ok) throw new Error(json.description ?? `Telegram ${method} xatosi`);
    return json.result;
  }
}
