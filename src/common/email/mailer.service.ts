import { MailerService as NestMailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';

@Injectable()
export class MailerService {
  constructor(private mailerService: NestMailerService) {}
  async sendEmail(email: string, login: string, password: string) {
    await this.mailerService.sendMail({
      to: email,
      subject: 'CRM tizimiga kirish - Foydalanuvchi yaratildi',
      template: 'index',
      context: {
        login: login,
        password: password,
      },
    });
  }
}
