import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CloudinaryService } from './cloudinary.service';

/**
 * FileStorageController — provides endpoints for uploading files to Cloudinary.
 * The frontend uploads a file here, gets a secure URL, and passes that URL
 * inside JSON payloads (e.g. register seller/rider).
 */
@Controller('upload')
export class FileStorageController {
  constructor(private readonly cloudinaryService: CloudinaryService) {}

  /**
   * Upload an image to Cloudinary.
   * Expects a multipart/form-data request with the key 'file'.
   *
   * POST /upload/image
   */
  @Post('image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded. Please send a file with the key "file".');
    }

    try {
      const result = await this.cloudinaryService.uploadImage(file);
      return {
        message: 'Image uploaded successfully',
        url: result.secure_url,
        publicId: result.public_id,
        bytes: result.bytes,
      };
    } catch (error) {
      throw new BadRequestException(
        error.message || 'Failed to upload image to Cloudinary. Make sure CLOUDINARY env variables are set.',
      );
    }
  }

  /**
   * Upload a video to Cloudinary.
   * Expects a multipart/form-data request with the key 'file'.
   * Max file size: 100MB (Cloudinary free tier limit).
   *
   * POST /upload/video
   */
  @Post('video')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  async uploadVideo(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No video uploaded. Please send a file with the key "file".');
    }

    try {
      const result = await this.cloudinaryService.uploadVideo(file);
      return {
        message: 'Video uploaded successfully',
        url: result.secure_url,
        publicId: result.public_id,
        bytes: result.bytes,
        duration: (result as any).duration,
      };
    } catch (error) {
      throw new BadRequestException(
        error.message || 'Failed to upload video to Cloudinary. Make sure CLOUDINARY env variables are set.',
      );
    }
  }
}
