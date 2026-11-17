import { HttpException, HttpStatus } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

/**
 * Akkaunt bo'yicha parol hujumidan himoya.
 *
 * `LoginThrottleGuard` IP bo'yicha cheklaydi, lekin hujumchi ko'p IP (botnet,
 * proxy) orqali bitta akkauntga parol tanlashi mumkin. Shu sababli muvaffaqiyatsiz
 * urinishlar akkaunt identifikatori (email / telefon) bo'yicha ham sanaladi va
 * chegaradan oshganda akkaunt vaqtincha bloklanadi.
 *
 * Hisoblagich process xotirasida — server qayta ishga tushganda tozalanadi.
 */
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 50_000;

type Entry = { failures: number; firstAt: number; lockedUntil: number };

export class AccountLockout {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly maxFailures = MAX_FAILURES,
    private readonly windowMs = WINDOW_MS,
    private readonly lockMs = LOCK_MS,
  ) {}

  /** Akkaunt bloklangan bo'lsa 429 tashlaydi. */
  assertNotLocked(key: string, now = Date.now()): void {
    const entry = this.entries.get(this.normalize(key));
    if (entry && entry.lockedUntil > now) {
      const minutes = Math.ceil((entry.lockedUntil - now) / 60_000);
      throw new HttpException(
        `Juda ko'p noto'g'ri urinish. Hisob ${minutes} daqiqaga vaqtincha bloklandi`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  recordFailure(key: string, now = Date.now()): void {
    const id = this.normalize(key);
    let entry = this.entries.get(id);

    if (!entry || now - entry.firstAt > this.windowMs) {
      entry = { failures: 0, firstAt: now, lockedUntil: 0 };
    }

    entry.failures += 1;
    if (entry.failures >= this.maxFailures) {
      entry.lockedUntil = now + this.lockMs;
      entry.failures = 0;
      entry.firstAt = now;
    }

    if (this.entries.size >= MAX_ENTRIES) this.prune(now);
    this.entries.set(id, entry);
  }

  recordSuccess(key: string): void {
    this.entries.delete(this.normalize(key));
  }

  private normalize(key: string): string {
    return key.trim().toLowerCase();
  }

  private prune(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.lockedUntil <= now && now - entry.firstAt > this.windowMs) {
        this.entries.delete(key);
      }
    }
  }
}

/** Xodim, o'qituvchi va o'quvchi logini uchun umumiy hisoblagich. */
export const accountLockout = new AccountLockout();

/**
 * Akkaunt topilmaganda ham bcrypt tekshiruvi bajariladi, shunda javob vaqti
 * bir xil bo'ladi va hujumchi javob tezligidan qaysi email/telefon tizimda
 * borligini aniqlay olmaydi (user enumeration).
 */
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer-not-a-password', 10);

export async function burnPasswordCheck(password: string): Promise<void> {
  await bcrypt.compare(password, DUMMY_HASH);
}
