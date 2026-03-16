import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

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

  async uploadFile(
    file: Express.Multer.File,
    folder: string = 'uploads',
  ): Promise<string> {
    try {
      if (!file) {
        throw new BadRequestException('File not provided');
      }

      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder,
            resource_type: 'auto',
            public_id: `${Date.now()}-${file.originalname.split('.')[0]}`,
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
      throw new BadRequestException(`File upload error: ${error.message}`);
    }
  }

  async uploadVideo(file: Express.Multer.File): Promise<string> {
    if (!file) {
      throw new BadRequestException('Video file not provided');
    }

    if (!file.mimetype.startsWith('video/')) {
      throw new BadRequestException('Only video files are allowed');
    }

    return this.uploadFile(file, 'lessons/videos');
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
