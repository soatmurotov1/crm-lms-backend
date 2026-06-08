import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

interface LoginNotification {
  userEmail: string;
  ipAddress: string;
  deviceName?: string;
  location?: string;
  loginType: string;
  timestamp: string;
}

@Injectable()
export class TelegramService {
  private botToken: string;
  private chatId: string;
  private apiUrl: string;
  private httpClient: AxiosInstance;
  private readonly logger = new Logger(TelegramService.name);
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000; // ms

  constructor(private configService: ConfigService) {
    this.botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN', '');
    this.chatId = this.configService.get<string>('TELEGRAM_CHAT_ID', '');
    this.apiUrl = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

    // Configure HTTP client with retry logic
    this.httpClient = axios.create({
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async sendLoginNotification(notification: LoginNotification): Promise<void> {
    if (!this.botToken || !this.chatId) {
      this.logger.warn(
        'Telegram bot token or chat ID is not configured. Skipping notification.',
      );
      return;
    }

    const message = this.formatLoginMessage(notification);
    await this.sendWithRetry(message);
  }

  async sendAdminNotification(message: string): Promise<void> {
    if (!this.botToken || !this.chatId) {
      this.logger.warn(
        'Telegram bot token or chat ID is not configured. Skipping notification.',
      );
      return;
    }

    await this.sendWithRetry(message);
  }

  private async sendWithRetry(
    message: string,
    attempt: number = 1,
  ): Promise<void> {
    try {
      const response = await this.httpClient.post(this.apiUrl, {
        chat_id: this.chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        disable_notification: false,
      });

      if (response.status === 200 && response.data.ok) {
        this.logger.debug(
          `Telegram message sent successfully. Message ID: ${response.data.result.message_id}`,
        );
        return;
      }

      throw new Error(
        `Telegram API returned: ${JSON.stringify(response.data)}`,
      );
    } catch (error) {
      this.logger.error(
        `Telegram notification attempt ${attempt}/${this.MAX_RETRIES} failed:`,
        error instanceof Error ? error.message : String(error),
      );

      // Retry logic
      if (attempt < this.MAX_RETRIES) {
        const delay = this.RETRY_DELAY * attempt;
        this.logger.debug(
          `Retrying after ${delay}ms... (Attempt ${attempt + 1}/${this.MAX_RETRIES})`,
        );
        await this.sleep(delay);
        return this.sendWithRetry(message, attempt + 1);
      }

      // Log final failure
      this.logger.error(
        `Failed to send Telegram notification after ${this.MAX_RETRIES} attempts`,
      );
    }
  }

  private formatLoginMessage(notification: LoginNotification): string {
    const timestamp = new Date(notification.timestamp).toLocaleString('en-US', {
      timeZone: 'Asia/Tashkent',
    });

    let message = `<b>🔐 Yangi kirish</b>\n\n`;
    message += `<b>📧 Email:</b> <code>${this.escapeHtml(notification.userEmail)}</code>\n`;
    message += `<b>🔑 Kirish turi:</b> ${notification.loginType}\n`;
    message += `<b>🌐 IP Addres:</b> <code>${notification.ipAddress}</code>\n`;

    if (notification.deviceName) {
      message += `<b>💻 Qurilma:</b> ${this.escapeHtml(notification.deviceName)}\n`;
    }

    if (notification.location) {
      message += `<b>📍 Joylashuvi:</b> ${this.escapeHtml(notification.location)}\n`;
    }

    message += `<b>⏰ Vaqti:</b> ${timestamp}`;

    return message;
  }

  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Health check method
  async healthCheck(): Promise<boolean> {
    if (!this.botToken || !this.chatId) {
      this.logger.warn('Telegram service is not configured');
      return false;
    }

    try {
      const response = await this.httpClient.get(
        `https://api.telegram.org/bot${this.botToken}/getMe`,
      );
      return response.status === 200 && response.data.ok;
    } catch (error) {
      this.logger.error('Telegram health check failed:', error);
      return false;
    }
  }
}
