import { Module } from '@nestjs/common';
import { MailerModule as NestMilerModule } from '@nestjs-modules/mailer';
import { join } from 'path';

@Module({
  imports: [
    NestMilerModule.forRoot({
      transport: {
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_PASS,
        },
      },
      defaults: {
        from: `"EduCenter" <${process.env.GMAIL_USER}>`,
      },
      template: {
        dir: join(process.cwd(), 'template'),
        options: {
          strict: true,
        },
      },
    }),
  ],
})
export class MailerModule {}
