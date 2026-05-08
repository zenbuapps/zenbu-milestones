import { Controller, Get, Logger, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Octokit } from '@octokit/rest';
import type { GithubHealthStatus } from 'shared';
import { AdminGuard } from '../common/guards/admin.guard';
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

  constructor(
    private readonly github: GitHubService,
    private readonly config: ConfigService,
  ) {}

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

  /**
   * [TEMP-DEBUG] admin-only 深度診斷 PAT 失敗的真因。
   *
   * 直接在 production env 內用 ZENBU_ORG_WRITE_TOKEN 打三隻 GitHub API：
   *   - /user           → token 屬於誰、是不是個人 / GitHub App
   *   - /orgs/{org}     → token 看不看得到 org（owner 簽錯、SAML SSO 沒授權都會在這 fail）
   *   - /orgs/{org}/repos?per_page=1 → token 有沒有 read repos 權限
   *
   * 每隻 API 印 raw status + GitHub 回的 error message，這比 GithubExceptionFilter
   * 包過的 "GitHub 認證失敗" 訊息精準得多——可以區分 401 Bad credentials / 404
   * Not Found / 403 Resource not accessible / 403 SAML enforcement required。
   *
   * 只暴露 token mask（前 4 + 後 4 + length），永不回傳完整 token。
   * 確認問題後此 method 必須整段移除。
   */
  @Get('github-debug')
  @UseGuards(AdminGuard)
  async debugGithub(): Promise<unknown> {
    const token = this.config.get<string>('ZENBU_ORG_WRITE_TOKEN') ?? '';
    const org = this.config.get<string>('GITHUB_ORG') ?? 'zenbuapps';

    const tokenMask =
      token.length > 8
        ? `${token.slice(0, 4)}...${token.slice(-4)} (len=${token.length})`
        : `(too short, len=${token.length})`;
    const tokenPrefix = token.startsWith('ghp_')
      ? 'classic-pat'
      : token.startsWith('github_pat_')
        ? 'fine-grained-pat'
        : token.startsWith('ghs_')
          ? 'github-app-installation'
          : token.startsWith('gho_')
            ? 'oauth-token'
            : 'unknown';
    const trailingWhitespace = token !== token.trim();

    type Probe = { status: number | null; message?: string; data?: unknown; raw?: unknown };

    const runProbe = async (fn: () => Promise<unknown>): Promise<Probe> => {
      try {
        const data = await fn();
        return { status: 200, data };
      } catch (err) {
        const e = err as { status?: number; message?: string; response?: { data?: unknown; headers?: Record<string, string> } };
        return {
          status: e.status ?? null,
          message: e.message?.slice(0, 300) ?? 'unknown',
          raw: e.response?.data,
        };
      }
    };

    const octokit = new Octokit({ auth: token, userAgent: 'zenbu-roadmaps-debug' });

    const probes = {
      user: await runProbe(async () => {
        const { data } = await octokit.users.getAuthenticated();
        return { login: data.login, type: data.type, name: data.name };
      }),
      org: await runProbe(async () => {
        const { data } = await octokit.orgs.get({ org });
        return { login: data.login, name: data.name };
      }),
      repos: await runProbe(async () => {
        const { data } = await octokit.repos.listForOrg({ org, per_page: 1, type: 'all' });
        return { count: data.length, firstRepo: data[0]?.name ?? null, isPrivate: data[0]?.private ?? null };
      }),
    };

    return {
      tokenMask,
      tokenPrefix,
      tokenTrailingWhitespace: trailingWhitespace,
      githubOrgEnv: org,
      probes,
    };
  }
}
