import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import { VerificationPurpose } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { SmsService } from 'src/common/sms/sms.service';
import { verificationSms } from 'src/common/sms/sms.templates';

/** Kod amal qilish muddati va urinishlar chegarasi. */
const CODE_TTL_MS = 3 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

/** Tasdiqlangan kod shuncha vaqt ichida ishlatilishi kerak. */
const VERIFIED_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly smsService: SmsService,
  ) {}

  /** Har chaqiruvda yangi 6 xonali tasodifiy kod. */
  private generateCode(): string {
    return String(randomInt(100000, 1000000));
  }

  async sendCode(phone: string, purpose: VerificationPurpose) {
    const lastCode = await this.prisma.verificationCode.findFirst({
      where: { phone, purpose },
      orderBy: { created_at: 'desc' },
    });

    // Spamning oldini olamiz: qayta yuborish uchun 60 soniya kutilsin.
    if (lastCode) {
      const sinceLast = Date.now() - lastCode.created_at.getTime();
      if (sinceLast < RESEND_COOLDOWN_MS) {
        const waitSeconds = Math.ceil((RESEND_COOLDOWN_MS - sinceLast) / 1000);
        throw new BadRequestException(
          `Yangi kod so'rash uchun ${waitSeconds} soniya kuting`,
        );
      }
    }

    const code = this.generateCode();
    const result = await this.smsService.send(
      phone,
      verificationSms(purpose, code),
    );

    if (!result.sent) {
      throw new ServiceUnavailableException(
        "SMS yuborib bo'lmadi. Birozdan so'ng qayta urinib ko'ring",
      );
    }

    await this.replaceCode(phone, purpose, code);

    return {
      success: true,
      message: 'Tasdiqlash kodi yuborildi',
      expiresIn: CODE_TTL_MS / 1000,
    };
  }

  async verifyCode(phone: string, code: string, purpose: VerificationPurpose) {
    const record = await this.prisma.verificationCode.findFirst({
      where: { phone, purpose, verifiedAt: null },
      orderBy: { created_at: 'desc' },
    });

    if (!record) {
      throw new BadRequestException("Kod topilmadi, qaytadan so'rang");
    }

    if (record.expiresAt.getTime() < Date.now()) {
      await this.prisma.verificationCode.delete({ where: { id: record.id } });
      throw new BadRequestException("Kod muddati tugadi, qaytadan so'rang");
    }

    if (record.attempts >= MAX_ATTEMPTS) {
      await this.prisma.verificationCode.delete({ where: { id: record.id } });
      throw new BadRequestException("Urinishlar soni tugadi, yangi kod so'rang");
    }

    if (record.code !== code) {
      await this.prisma.verificationCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException("Kod noto'g'ri");
    }

    await this.prisma.verificationCode.update({
      where: { id: record.id },
      data: { verifiedAt: new Date() },
    });

    return {
      success: true,
      message: 'Kod tasdiqlandi',
      // Endi parol o'rnatish / raqamni almashtirish so'rovini yuborish mumkin.
      nextStepExpiresIn: VERIFIED_TTL_MS / 1000,
    };
  }

  /**
   * Kodni tekshirib, darhol "sarflaydi" (bir marta ishlatiladi).
   *
   * Ikkala oqimda ham ishlaydi:
   *  - mijoz avval `/verify-code` ni chaqirgan bo'lsa (kod allaqachon
   *    tasdiqlangan) - tasdiq oynasi 15 daqiqa;
   *  - to'g'ridan-to'g'ri parol o'rnatishga kelgan bo'lsa - kodning o'z
   *    muddati (3 daqiqa) tekshiriladi.
   */
  async verifyAndConsume(
    phone: string,
    code: string,
    purpose: VerificationPurpose,
  ): Promise<void> {
    const record = await this.prisma.verificationCode.findFirst({
      where: { phone, purpose },
      orderBy: { created_at: 'desc' },
    });

    if (!record) {
      throw new BadRequestException("Kod topilmadi, qaytadan so'rang");
    }

    const deadline = record.verifiedAt
      ? record.verifiedAt.getTime() + VERIFIED_TTL_MS
      : record.expiresAt.getTime();

    if (deadline < Date.now()) {
      await this.prisma.verificationCode.delete({ where: { id: record.id } });
      throw new BadRequestException("Kod muddati tugadi, qaytadan so'rang");
    }

    if (record.attempts >= MAX_ATTEMPTS) {
      await this.prisma.verificationCode.delete({ where: { id: record.id } });
      throw new BadRequestException("Urinishlar soni tugadi, yangi kod so'rang");
    }

    if (record.code !== code) {
      await this.prisma.verificationCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException("Kod noto'g'ri");
    }

    await this.prisma.verificationCode.delete({ where: { id: record.id } });
  }

  /**
   * Admin yangi foydalanuvchi yaratganda chaqiriladi. SMS ketmasa ham
   * foydalanuvchi yaratilgan bo'ladi, shuning uchun bu metod hech qachon
   * exception tashlamaydi - faqat natijani qaytaradi.
   */
  async sendCodeQuietly(
    phone: string,
    purpose: VerificationPurpose = VerificationPurpose.REGISTER,
  ): Promise<boolean> {
    try {
      const code = this.generateCode();
      const result = await this.smsService.send(
        phone,
        verificationSms(purpose, code),
      );

      if (!result.sent) {
        this.logger.error(`SMS yuborilmadi (${phone}): ${result.reason}`);
        return false;
      }

      await this.replaceCode(phone, purpose, code);
      return true;
    } catch (error) {
      this.logger.error(
        `Tasdiqlash kodini yuborishda xato (${phone}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  /** Eski kodlar ishlatilmasin - har safar bittasi amal qiladi. */
  private async replaceCode(
    phone: string,
    purpose: VerificationPurpose,
    code: string,
  ): Promise<void> {
    await this.prisma.verificationCode.deleteMany({
      where: { phone, purpose },
    });

    await this.prisma.verificationCode.create({
      data: {
        phone,
        code,
        purpose,
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });
  }
}
