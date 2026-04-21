import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * BunnyService
 * ---------------------------------------------------------------
 * 包裝 Bunny Storage API 的薄殼。為了不引入大型 Bunny SDK（套件未維護），
 * 直接用 native fetch 打 PUT。
 *
 * Storage REST：PUT https://{host}/{zone}/{path}
 *   Header: AccessKey: {BUNNY_STORAGE_PASSWORD}
 *           Content-Type: {mime}
 *   Body:   raw bytes
 *
 * Pull Zone（公開讀取）：{BUNNY_CDN_URL}/{path}
 *   path 部分需與 storage 完全一致；結果即為前端可貼進 markdown 的 URL。
 *
 * 失敗時 throw ServiceUnavailableException（503）給呼叫端統一回應。
 */
@Injectable()
export class BunnyService {
  private readonly logger = new Logger(BunnyService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * 上傳一個 Buffer 到指定路徑。
   * @param path 不含前導斜線的相對路徑（zone 內），例：`issues/{userId}/{ts}-{rand}.png`
   * @param body 原始檔案內容
   * @param mimeType MIME type（會原樣寫入 response header 給 CDN）
   * @returns 公開 CDN URL
   */
  async uploadBuffer(path: string, body: Buffer, mimeType: string): Promise<string> {
    const cdnUrl = this.requireEnv('BUNNY_CDN_URL');
    const host = this.requireEnv('BUNNY_STORAGE_HOST');
    const zone = this.requireEnv('BUNNY_STORAGE_ZONE');
    const password = this.requireEnv('BUNNY_STORAGE_PASSWORD');

    const cleanPath = path.replace(/^\/+/, '');
    const putUrl = `https://${host}/${zone}/${cleanPath}`;

    let res: Response;
    try {
      res = await fetch(putUrl, {
        method: 'PUT',
        headers: {
          AccessKey: password,
          'Content-Type': mimeType,
          // Bunny CDN 會回傳此 header；明示禁止 cache 不適合，預設 cache 即可
        },
        body,
      });
    } catch (err) {
      this.logger.error(`Bunny PUT 失敗：${(err as Error).message}`);
      throw new ServiceUnavailableException('附件儲存服務無法連線，請稍後再試');
    }

    if (!res.ok) {
      // 刻意不把 body / token 帶到 log，避免 secret 外洩
      this.logger.error(`Bunny PUT 回傳非 2xx：status=${res.status}`);
      throw new ServiceUnavailableException(
        `附件儲存失敗（status=${res.status}），請稍後再試`,
      );
    }

    const cleanCdn = cdnUrl.replace(/\/+$/, '');
    return `${cleanCdn}/${cleanPath}`;
  }

  private requireEnv(key: string): string {
    const v = this.config.get<string>(key);
    if (!v) {
      throw new ServiceUnavailableException(`缺少必要設定：${key}`);
    }
    return v;
  }
}
