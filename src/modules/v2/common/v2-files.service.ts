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
      disposition: 'inline',
    });
  }
}
