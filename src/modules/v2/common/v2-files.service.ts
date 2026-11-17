import {
  BadRequestException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from 'src/common/prisma/prisma.service';

/** Rasm yuklash chegarasi (chek, ko'rik surati, diagramma). */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

const startsWith = (buf: Buffer, bytes: number[], offset = 0) =>
  buf.length >= offset + bytes.length &&
  bytes.every((byte, index) => buf[offset + index] === byte);

const ascii = (buf: Buffer, text: string, offset = 0) =>
  buf.length >= offset + text.length &&
  buf.toString('latin1', offset, offset + text.length) === text;

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/**
 * Brauzer yuborgan `mimetype` ga ishonib bo'lmaydi — uni istalgan mijoz
 * o'zgartiradi (masalan HTML/JS faylni `image/png` deb yuborish). Shuning
 * uchun fayl boshidagi imzo (magic bytes) e'lon qilingan turga mosligi
 * tekshiriladi.
 */
export function matchesSignature(buf: Buffer, mimeType: string): boolean {
  switch (mimeType) {
    case 'application/pdf':
      return ascii(buf, '%PDF-');
    case 'image/jpeg':
      return startsWith(buf, [0xff, 0xd8, 0xff]);
    case 'image/png':
      return startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/webp':
      return ascii(buf, 'RIFF') && ascii(buf, 'WEBP', 8);
    case 'image/heic':
    case 'image/heif':
    case 'video/mp4':
      return ascii(buf, 'ftyp', 4);
    case 'application/zip':
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return startsWith(buf, ZIP);
    case 'application/msword':
    case 'application/vnd.ms-excel':
    case 'application/vnd.ms-powerpoint':
      return startsWith(buf, OLE);
    case 'audio/mpeg':
      return ascii(buf, 'ID3') || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
    case 'text/plain': {
      // Matn faylida NUL bayt bo'lmaydi; HTML/skriptni matn deb yashirish ham
      // rad etiladi.
      const head = buf.subarray(0, 4096);
      if (head.includes(0)) return false;
      return !/<\s*(script|html|iframe|svg|object|embed)\b/i.test(
        head.toString('utf8'),
      );
    }
    default:
      return false;
  }
}

/** Brauzerda ochilsa ham xavfsiz turlar — qolganlari faqat yuklab olinadi. */
const INLINE_SAFE = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'audio/mpeg',
]);

export interface UploadedBlob {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

/**
 * Kichik shaxsiy fayllar bazada saqlanadi. Ular faqat avtorizatsiyadan
 * o'tgan so'rov orqali beriladi — ochiq CDN havolasi bo'lmaydi.
 */
@Injectable()
export class V2FilesService {
  constructor(private prisma: PrismaService) {}

  async save(
    file: UploadedBlob | undefined,
    organizationId: number | null,
    allowed: string[] = IMAGE_MIME_TYPES,
  ): Promise<{ id: number; mimeType: string; size: number; sha256: string }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Fayl yuborilmadi');
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException('Fayl hajmi 8 MB dan oshmasligi kerak');
    }
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException('Bu turdagi fayl qabul qilinmaydi');
    }
    if (!matchesSignature(file.buffer, file.mimetype)) {
      throw new BadRequestException(
        'Fayl mazmuni ko‘rsatilgan turga mos emas',
      );
    }

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const row = await this.prisma.storedFile.create({
      data: {
        organizationId,
        mimeType: file.mimetype,
        size: file.size,
        sha256,
        data: new Uint8Array(file.buffer),
      },
      select: { id: true },
    });

    return { id: row.id, mimeType: file.mimetype, size: file.size, sha256 };
  }

  async stream(id: number): Promise<StreamableFile> {
    const row = await this.prisma.storedFile.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Fayl topilmadi');

    return new StreamableFile(Buffer.from(row.data), {
      type: row.mimeType,
      length: row.size,
      disposition: INLINE_SAFE.has(row.mimeType) ? 'inline' : 'attachment',
    });
  }
}
