import { Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Controller('uploads')
export class UploadsController {
  @UseGuards(AuthGuard('jwt'))
  @Post('selfie')
  async createSelfieUpload() {
    return {
      uploadUrl: 'https://s3.example.com/bucket/selfies/presigned-url',
      maxSizeBytes: 5_000_000,
      allowedMimeTypes: ['image/jpeg', 'image/png'],
      minResolution: { width: 480, height: 640 },
      maxResolution: { width: 1920, height: 1920 },
    };
  }
}
