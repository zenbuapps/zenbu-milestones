import {
  BadRequestException,
  Controller,
  Logger,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { User } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import {
  UPLOAD_IMAGE_ALLOWED_MIME,
  UPLOAD_IMAGE_MAX_BYTES,
  type UploadImageMime,
  type UploadImageResponse,
} from 'shared';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { BunnyService } from './bunny.service';

interface AuthedRequest {
  user: User;
}

interface ApiSuccess<T> {
  success: true;
  data: T;
}

const MIME_EXTENSION: Record<UploadImageMime, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

/**
 * UploadsController
 * ---------------------------------------------------------------
 * 圖片上傳。前端 IssueSubmitForm 在 paste / drop image 時呼叫。
 *
 * 安全：
 *   - AuthenticatedGuard 保護（防匿名濫用 Bunny quota）
 *   - MIME 白名單（只接受常見圖片）
 *   - 檔案大小 10 MB 上限（multer config）
 *   - 檔名一律 timestamp + random，不沿用 user 提供的（避 path traversal）
 *   - 路徑包含 user id 做 namespace，事後可追溯
 */
@Controller('uploads')
@UseGuards(AuthenticatedGuard)
export class UploadsController {
  private readonly logger = new Logger(UploadsController.name);

  constructor(private readonly bunny: BunnyService) {}

  @Post('image')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: UPLOAD_IMAGE_MAX_BYTES },
    }),
  )
  async uploadImage(
    @Req() req: AuthedRequest,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<ApiSuccess<UploadImageResponse>> {
    if (!file) {
      throw new BadRequestException('未收到檔案（欄位名應為 "file"）');
    }
    if (!UPLOAD_IMAGE_ALLOWED_MIME.includes(file.mimetype as UploadImageMime)) {
      throw new BadRequestException(
        `不支援的圖片類型：${file.mimetype}（允許：${UPLOAD_IMAGE_ALLOWED_MIME.join(', ')}）`,
      );
    }
    if (file.size > UPLOAD_IMAGE_MAX_BYTES) {
      throw new BadRequestException(
        `檔案太大（${file.size} bytes），上限 ${UPLOAD_IMAGE_MAX_BYTES} bytes`,
      );
    }

    const ext = MIME_EXTENSION[file.mimetype as UploadImageMime];
    const ts = Date.now();
    const rand = randomBytes(6).toString('hex');
    const path = `issues/${req.user.id}/${ts}-${rand}.${ext}`;

    const url = await this.bunny.uploadBuffer(path, file.buffer, file.mimetype);
    this.logger.log(`upload OK: user=${req.user.id} size=${file.size} → ${path}`);

    return {
      success: true,
      data: {
        url,
        filename: file.originalname || `${ts}.${ext}`,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
    };
  }
}
