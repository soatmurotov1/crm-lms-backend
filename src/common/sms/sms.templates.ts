import { VerificationPurpose } from '@prisma/client';

/**
 * Eskiz.uz faqat oldindan tasdiqlangan shablonlarni yuboradi, shuning uchun
 * matnlar shu yerda bir joyda turadi va o'zgartirilmaydi. Kod har safar
 * yangidan tasodifiy generatsiya qilinadi (VerificationService).
 */
export function verificationSms(
  purpose: VerificationPurpose,
  code: string,
): string {
  switch (purpose) {
    case VerificationPurpose.RESET_PASSWORD:
      return `Fixoo platformasida parolingizni tiklash uchun tasdiqlash kodi: ${code}. Kodni hech kimga bermang!`;
    case VerificationPurpose.CHANGE_PHONE:
      return `Fixoo platformasida telefoningizni o'zgartirish uchun tasdiqlash kodi: ${code}. Kodni hech kimga bermang!`;
    case VerificationPurpose.REGISTER:
    default:
      return `Fixoo platformasidan ro'yxatdan o'tish uchun tasdiqlash kodi: ${code}. Kodni hech kimga bermang!`;
  }
}
