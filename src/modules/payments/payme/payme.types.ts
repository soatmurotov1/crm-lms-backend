/**
 * Payme Merchant API - protokol tiplari va xato kodlari.
 *
 * Payme JSON-RPC 2.0 uslubida ishlaydi: hamma metod bitta endpoint'ga
 * `POST` bilan keladi, javob esa DOIM HTTP 200 bo'ladi - xato ham javob
 * tanasida `error` obyekti sifatida qaytariladi. Shu sabab bu yerda
 * NestJS'ning odatiy `HttpException` lari ishlatilmaydi.
 *
 * Hujjat: https://developer.help.paycom.uz/protokol-merchant-api/
 */

/** Tranzaksiya holatlari. */
export const PaymeState = {
  /** Yaratilgan, hali to'lanmagan. */
  CREATED: 1,
  /** To'langan. */
  PERFORMED: 2,
  /** To'lanmasdan bekor qilingan. */
  CANCELED: -1,
  /** To'langandan keyin bekor qilingan (pul qaytarilgan). */
  CANCELED_AFTER_PERFORM: -2,
} as const;

/**
 * Payme xato kodlari. Musbat qiymat yo'q - hammasi manfiy.
 * -31050 dan -31099 gacha bo'lgan oraliq `account` maydonlariga tegishli
 * xatolar uchun ajratilgan va uni biz o'zimiz belgilaymiz.
 */
export const PaymeErrorCode = {
  /** Autentifikatsiya o'tmadi. */
  INSUFFICIENT_PRIVILEGE: -32504,
  /** Bunday metod yo'q. */
  METHOD_NOT_FOUND: -32601,
  /** JSON o'qib bo'lmadi. */
  PARSE_ERROR: -32700,
  /** Summa mos kelmadi. */
  INVALID_AMOUNT: -31001,
  /** Tranzaksiya topilmadi. */
  TRANSACTION_NOT_FOUND: -31003,
  /** Bekor qilib bo'lmaydi (xizmat allaqachon ko'rsatilgan). */
  UNABLE_TO_CANCEL: -31007,
  /** Amalni bajarib bo'lmaydi (holat mos emas yoki muddat o'tgan). */
  UNABLE_TO_PERFORM: -31008,
  /** `account.payment_id` topilmadi yoki yaroqsiz. */
  ACCOUNT_NOT_FOUND: -31050,
} as const;

/** Payme tranzaksiyani yaratgandan keyin 12 soat ichida tasdiqlashi shart. */
export const PAYME_TRANSACTION_TIMEOUT_MS = 12 * 60 * 60 * 1000;

/** Muddati o'tgani sababli bekor qilinganda Payme kutadigan sabab kodi. */
export const PAYME_REASON_TIMEOUT = 4;

/**
 * Payme xato xabarini uch tilda kutadi. Bir xil matnni har joyda
 * takrorlamaslik uchun kichik yordamchi.
 */
export interface PaymeLocalizedMessage {
  ru: string;
  uz: string;
  en: string;
}

export function paymeMessage(
  uz: string,
  ru: string,
  en: string,
): PaymeLocalizedMessage {
  return { uz, ru, en };
}

/**
 * Protokol xatosi. Controller uni ushlab, JSON-RPC `error` obyektiga
 * aylantiradi va HTTP 200 bilan qaytaradi.
 */
export class PaymeError extends Error {
  constructor(
    readonly code: number,
    readonly localized: PaymeLocalizedMessage,
    /** Qaysi maydon xato ekani (`account` xatolari uchun). */
    readonly data?: string,
  ) {
    super(localized.en);
    this.name = 'PaymeError';
  }
}

/** Payme yuboradigan so'rov tanasi. */
export interface PaymeRequest {
  method?: string;
  params?: Record<string, unknown>;
  id?: number | string | null;
}

export interface PaymeAccount {
  payment_id?: string | number;
  student_id?: string | number;
  group_id?: string | number;
}
