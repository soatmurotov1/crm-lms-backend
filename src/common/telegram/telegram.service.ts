import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

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

  constructor(private configService: ConfigService) {
    this.botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    this.chatId = this.configService.get<string>('TELEGRAM_CHAT_ID');
    this.apiUrl = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
  }

  async sendLoginNotification(notification: LoginNotification): Promise<void> {
    if (!this.botToken || !this.chatId) {
      console.warn('Telegram bot token yoki chat ID configured emas');
      return;
    }

    const message = this.formatLoginMessage(notification);

    try {
      await axios.post(this.apiUrl, {
        chat_id: this.chatId,
        text: message,
        parse_mode: 'HTML',
      });
    } catch (error) {
      console.error('Telegram xabar yuborishda xato:', error);
    }
  }

  private formatLoginMessage(notification: LoginNotification): string {
    return `
<b>🔐 Yangi kirish</b>

<b>Email:</b> ${notification.userEmail}
<b>Turdagi kirish:</b> ${notification.loginType}
<b>IP Addres:</b> <code>${notification.ipAddress}</code>
${notification.deviceName ? `<b>Qurilma:</b> ${notification.deviceName}` : ''}
${notification.location ? `<b>Joylashuvi:</b> ${notification.location}` : ''}
<b>Vaqti:</b> ${notification.timestamp}
    `.trim();
  }

  async sendAdminNotification(message: string): Promise<void> {
    if (!this.botToken || !this.chatId) {
      console.warn('Telegram bot token yoki chat ID configured emas');
      return;
    }

    try {
      await axios.post(this.apiUrl, {
        chat_id: this.chatId,
        text: message,
        parse_mode: 'HTML',
      });
    } catch (error) {
      console.error('Telegram xabar yuborishda xato:', error);
    }
  }
}
