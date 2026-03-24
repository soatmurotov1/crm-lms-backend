import { Module } from '@nestjs/common';
import { MailerModule as NestMilerModule } from '@nestjs-modules/mailer';
import { join } from 'path';

@Module({
  imports: [
    NestMilerModule.forRoot({
      transport: {
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_PASS,
        },
      },
      defaults: {
        from: `"Soatmurotov Abrorbek" <${process.env.GMAIL_USER}>`,
      },
      template: {
        dir: join(__dirname, '../../..', 'template'),
        options: {
          strict: true,
        },
      },
    }),
  ],
})
export class MailerModule {}
