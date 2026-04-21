import { Controller, Get, Logger } from '@nestjs/common';
import type { GithubHealthStatus } from 'shared';
import { GitHubService } from '../github/github.service';

/**
 * GitHubHealthController
 * ---------------------------------------------------------------
 * GET /api/health/github
 *
 * 刻意與既有 `HealthController(/api/health)` 風格保持一致 —— 公開、無 guard：
 *   - 讓部署平台 / uptime monitor 隨時可 probe，不需先登入
 *   - 但僅暴露 GitHub API 剩餘額度、不回傳任何 org 資料，不構成敏感資訊外洩
 *
 * 行為契約：
 *   - 成功 → HTTP 200 + { ok: true, remaining, limit, resetAt, message: null }
 *   - 失敗（GitHubService 拋錯）→ **仍回 HTTP 200** + { ok: false, message }
 *     健康檢查不該拋 5xx；把狀態全放在 body 讓 caller 自己 branch。
 *
 * 不 import Dashboard 相關 provider，保持耦合最少。
 */
@Controller('health')
export class GitHubHealthController {
  private readonly logger = new Logger(GitHubHealthController.name);

  constructor(private readonly github: GitHubService) {}

  @Get('github')
  async checkGithub(): Promise<GithubHealthStatus> {
    try {
      const info = await this.github.getRateLimit();
      return {
        ok: true,
        remaining: info.remaining,
        limit: info.limit,
        resetAt: info.resetAt,
        message: null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      this.logger.warn(`GitHub health check failed: ${message}`);
      return {
        ok: false,
        remaining: null,
        limit: null,
        resetAt: null,
        message,
      };
    }
  }
}
