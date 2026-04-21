import { Controller, Get } from '@nestjs/common';

interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

/**
 * HealthController
 * ---------------------------------------------------------------
 * GET /api/health — 無驗證，讓部署平台（Railway / Cloudflare Tunnel）
 * 或 SPA 啟動時的 probe 呼叫，確認 API 活著。
 */
@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
