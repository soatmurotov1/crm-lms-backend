import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, isAxiosError } from 'axios';

export interface SendSmsResult {
  sent: boolean;
  reason?: string;
}

/**
 * Eskiz.uz orqali SMS yuborish.
 *
 * API oqimi:
 *   POST /api/auth/login   -> { data: { token } }   (token ~30 kun yashaydi)
 *   POST /api/message/sms/send  (Authorization: Bearer <token>)
 *
 * Token muddati tugasa 401 qaytadi - shu holatda bir marta qayta login
 * qilib, so'rovni takrorlaymiz.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly http: AxiosInstance;

  private readonly login: string;
  private readonly password: string;
  private readonly from: string;

  private token: string | null = null;
  private loginRequest: Promise<string> | null = null;

  constructor(private readonly config: ConfigService) {
    this.login = (this.config.get<string>('SMS_LOGIN') ?? '').trim();
    this.password = (this.config.get<string>('SMS_PASSWORD') ?? '').trim();
    this.from = (this.config.get<string>('SMS_FROM') ?? '4546').trim();

    this.http = axios.create({
      baseURL:
        this.config.get<string>('SMS_BASE_URL') ?? 'https://notify.eskiz.uz/api',
      timeout: 15_000,
    });

    if (!this.isConfigured) {
      this.logger.warn(
        "SMS sozlanmagan: .env faylda SMS_LOGIN yoki SMS_PASSWORD bo'sh. SMS yuborilmaydi.",
      );
    }
  }

  private get isConfigured(): boolean {
    return Boolean(this.login && this.password);
  }

  /** Eskiz `998901234567` ko'rinishini kutadi - `+` va bo'shliqlarsiz. */
  private toEskizPhone(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  private async authenticate(): Promise<string> {
    // Bir vaqtda bir nechta SMS ketsa, login so'rovi ham bitta bo'lsin.
    if (this.loginRequest) return this.loginRequest;

    this.loginRequest = (async () => {
      const body = new URLSearchParams({
        email: this.login,
        password: this.password,
      });

      const { data } = await this.http.post<{ data?: { token?: string } }>(
        '/auth/login',
        body,
      );

      const token = data?.data?.token;
      if (!token) {
        throw new Error('Eskiz javobida token yo\'q');
      }

      this.token = token;
      return token;
    })();

    try {
      return await this.loginRequest;
    } finally {
      this.loginRequest = null;
    }
  }

  /**
   * SMS yuboradi. Xatolik butun so'rovni yiqitmasligi uchun exception
   * o'rniga natija qaytaradi - chaqiruvchi o'zi qaror qiladi.
   */
  async send(phone: string, message: string): Promise<SendSmsResult> {
    const mobilePhone = this.toEskizPhone(phone);

    if (mobilePhone.length !== 12) {
      this.logger.warn(`Telefon raqami noto'g'ri, SMS yuborilmadi: "${phone}"`);
      return { sent: false, reason: 'invalid_phone' };
    }

    if (!this.isConfigured) {
      this.logger.warn(
        `SMS sozlanmagani uchun yuborilmadi: ${phone} (SMS_LOGIN / SMS_PASSWORD ni tekshiring)`,
      );
      return { sent: false, reason: 'sms_not_configured' };
    }

    try {
      await this.post(mobilePhone, message);
      this.logger.log(`SMS yuborildi: ${phone}`);
      return { sent: true };
    } catch (error) {
      this.logger.error(`SMS yuborilmadi (${phone}): ${this.describe(error)}`);
      return { sent: false, reason: this.describe(error) };
    }
  }

  private async post(mobilePhone: string, message: string): Promise<void> {
    const token = this.token ?? (await this.authenticate());

    const body = new URLSearchParams({
      mobile_phone: mobilePhone,
      message,
      from: this.from,
    });

    try {
      await this.http.post('/message/sms/send', body, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (error) {
      // Token eskirgan bo'lsa bir marta yangilab, qayta urinamiz.
      if (isAxiosError(error) && error.response?.status === 401) {
        this.token = null;
        const fresh = await this.authenticate();
        await this.http.post('/message/sms/send', body, {
          headers: { Authorization: `Bearer ${fresh}` },
        });
        return;
      }
      throw error;
    }
  }

  private describe(error: unknown): string {
    if (isAxiosError(error)) {
      const status = error.response?.status;
      const payload = error.response?.data as
        | { message?: string; error?: string }
        | undefined;
      const detail = payload?.message ?? payload?.error ?? error.message;

      if (status === 401) {
        return `401 — Eskiz login/parol xato (SMS_LOGIN / SMS_PASSWORD ni tekshiring)`;
      }
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return `${error.code} — Eskiz serveriga ulanish vaqti tugadi`;
      }
      if (error.code === 'ENOTFOUND') {
        return `${error.code} — Eskiz hosti topilmadi (DNS / internet ulanishini tekshiring)`;
      }
      return status ? `${status} — ${detail}` : detail;
    }

    return error instanceof Error ? error.message : String(error);
  }
}
