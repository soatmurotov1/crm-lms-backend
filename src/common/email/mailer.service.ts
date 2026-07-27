import { MailerService as NestMailerService } from '@nestjs-modules/mailer';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  constructor(private mailerService: NestMailerService) {}

  async sendEmail(email: string, login: string, password: string) {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'EduCenter tizimiga kirish - Foydalanuvchi yaratildi',
        template: 'index',
        context: {
          login: login,
          password: password,
        },
      });
      this.logger.log(`Email successfully sent to ${email}`);
    } catch (error) {
      const { message, stack } =
        error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Failed to send email to ${email}: ${message}`, stack);
      throw error;
    }
  }
}
