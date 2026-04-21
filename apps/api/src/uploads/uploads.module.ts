import { Module } from '@nestjs/common';
import { BunnyService } from './bunny.service';
import { UploadsController } from './uploads.controller';

/**
 * UploadsModule
 * ---------------------------------------------------------------
 * 圖片上傳功能。controller 用 multer FileInterceptor 接 multipart，
 * service 把 buffer PUT 到 Bunny CDN，回傳公開 URL。
 *
 * BunnyService 不外露給其他 module；只 controller 內部用。
 */
@Module({
  controllers: [UploadsController],
  providers: [BunnyService],
})
export class UploadsModule {}
