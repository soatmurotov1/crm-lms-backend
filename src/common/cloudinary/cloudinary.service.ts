import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

/** Profil rasmlari uchun ruxsat etilgan turlar. */
export const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/** Dars videolari uchun ruxsat etilgan turlar. */
export const VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
]);

/** Uy vazifa / imtihon ilovalari. */
export const DOCUMENT_MIME_TYPES = new Set([
  ...IMAGE_MIME_TYPES,
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'text/plain',
]);

@Injectable()
export class CloudinaryService {
  constructor(private configService: ConfigService) {
    this.initializeCloudinary();
  }

  private initializeCloudinary() {
    try {
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });
    } catch (error) {
      console.error('Failed to initialize Cloudinary:', error);
    }
  }

  /**
   * Cloudinary'da `/` papka ajratgichi hisoblanadi, shuning uchun fayl nomini
   * xom holda `public_id` ga qo'yib bo'lmaydi: `../../boshqa` kabi nom faylni
   * mo'ljallangan papkadan tashqariga yozib yuboradi yoki mavjudini almashtiradi.
   */
  private safePublicId(originalname: string): string {
    const base = String(originalname || '')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 60)
      .replace(/^-|-$/g, '');

    return base || 'file';
  }

  async uploadFile(
    file: Express.Multer.File,
    folder: string = 'uploads',
    allowedMimeTypes: Set<string> = IMAGE_MIME_TYPES,
  ): Promise<string> {
    try {
      if (!file) {
        throw new BadRequestException('File not provided');
      }

      // Turini tekshirmasak, `resource_type: 'auto'` bilan SVG/HTML ham
      // yuklanadi va CDN'dan bevosita ochiladigan sahifaga aylanadi.
      if (!allowedMimeTypes.has(file.mimetype)) {
        throw new BadRequestException(
          `Ruxsat etilmagan fayl turi: ${file.mimetype}`,
        );
      }

      const resourceType = file.mimetype.startsWith('video/')
        ? 'video'
        : file.mimetype.startsWith('image/')
          ? 'image'
          : 'raw';

      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder,
            resource_type: resourceType,
            public_id: `${Date.now()}-${this.safePublicId(file.originalname)}`,
          },
          (error, result: any) => {
            if (error) {
              reject(
                new BadRequestException(`Upload failed: ${error.message}`),
              );
            } else if (result) {
              resolve(result.secure_url);
            } else {
              reject(
                new BadRequestException('Upload failed: No result returned'),
              );
            }
          },
        );

        stream.end(file.buffer);
      });
    } catch (error) {
      // Validatsiya xatosi o'z matni bilan chiqsin, o'ralib ketmasin.
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(`File upload error: ${error.message}`);
    }
  }

  async uploadVideo(file: Express.Multer.File): Promise<string> {
    if (!file) {
      throw new BadRequestException('Video file not provided');
    }

    return this.uploadFile(file, 'lessons/videos', VIDEO_MIME_TYPES);
  }

  async deleteFile(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (error) {
      throw new BadRequestException(`Delete failed: ${error.message}`);
    }
  }

  async deleteVideo(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
    } catch (error) {
      throw new BadRequestException(`Video delete failed: ${error.message}`);
    }
  }
}
