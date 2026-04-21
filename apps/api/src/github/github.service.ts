import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Octokit } from '@octokit/rest';
import { RateLimitedError, UpstreamAuthError, UpstreamError } from './github.errors';

/**
 * 代轉 issue 時加上的來源 label。
 * 用於 GitHub 端追蹤「此 issue 來自 zenbu-milestones 網站審核通過」，
 * 方便統計與調查。label 若不存在會先自動建立；若建立 label 失敗
 * 不影響 issue 本體，僅記錄 warning。
 */
const SOURCE_LABEL_NAME = 'via-zenbu-milestones';
const SOURCE_LABEL_COLOR = '0e8a16'; // 綠色（GitHub 慣例）
const SOURCE_LABEL_DESC = 'Issue submitted via zenbu-milestones portal';

export interface CreateIssueParams {
  owner: string;
  repo: string;
  title: string;
  body: string;
}

export interface CreateIssueResult {
  number: number;
  htmlUrl: string;
}

/**
 * GitHubService
 * ---------------------------------------------------------------
 * 封裝 @octokit/rest，使用 ZENBU_ORG_WRITE_TOKEN 代為呼叫 GitHub
 * REST API（目前只實作 createIssue，未來可擴充 label / milestone 等）。
 *
 * 錯誤處理契約：
 *   - 401 / 403 (非 rate limit) → UpstreamAuthError
 *   - 429 或 rate limit header 耗盡 → RateLimitedError
 *   - 其他 → UpstreamError（status 保留以便 log）
 *
 * 設計決策：
 *   - constructor 讀 token 並 new Octokit()；token 缺失直接 throw
 *     → 讓 Nest bootstrap 當場失敗，比 runtime 撞牆好除錯。
 *   - 不把 token 附到 Error message / log 任何輸出。
 *   - 來源 label 失敗不影響 approve 主流程（plan §5 Open Question 5-1）。
 */
@Injectable()
export class GitHubService implements OnModuleInit {
  private readonly logger = new Logger(GitHubService.name);
  private readonly octokit: Octokit;

  constructor(private readonly config: ConfigService) {
    const token = this.config.get<string>('ZENBU_ORG_WRITE_TOKEN');
    if (!token || token.trim() === '') {
      throw new Error('ZENBU_ORG_WRITE_TOKEN 未設定，無法啟動 GitHubService');
    }
    this.octokit = new Octokit({
      auth: token,
      userAgent: 'zenbu-milestones-api',
    });
  }

  onModuleInit(): void {
    this.logger.log('GitHubService 已初始化（ZENBU_ORG_WRITE_TOKEN 已載入）');
  }

  /**
   * 建立 issue 並嘗試掛上來源 label。
   *
   * 流程：
   *   1. createIssue → 拿到 issue number / html_url
   *   2. ensureSourceLabel → 若 label 不存在則建立（404 / 422 already_exists 都 ok）
   *   3. addSourceLabel → 把 label 掛到 issue
   *   步驟 2/3 任一失敗只 log warning，不 rethrow。
   */
  async createIssue(params: CreateIssueParams): Promise<CreateIssueResult> {
    const { owner, repo, title, body } = params;
    let result: CreateIssueResult;
    try {
      const { data } = await this.octokit.issues.create({
        owner,
        repo,
        title,
        body,
      });
      result = { number: data.number, htmlUrl: data.html_url };
    } catch (err) {
      throw this.mapError(err);
    }

    // 從這裡以下是「best-effort」label 處理；失敗吞掉。
    await this.ensureSourceLabel(owner, repo).catch((labelErr) => {
      this.logger.warn(
        `[createIssue] ensureSourceLabel 失敗於 ${owner}/${repo}，issue 已建立（#${result.number}）：${this.describeError(labelErr)}`,
      );
    });
    await this.addSourceLabel(owner, repo, result.number).catch((labelErr) => {
      this.logger.warn(
        `[createIssue] addSourceLabel 失敗於 ${owner}/${repo}#${result.number}：${this.describeError(labelErr)}`,
      );
    });

    return result;
  }

  /**
   * 確認 source label 存在；不存在就建立。
   * 既有（422 already_exists）視為成功。
   */
  private async ensureSourceLabel(owner: string, repo: string): Promise<void> {
    try {
      await this.octokit.issues.getLabel({ owner, repo, name: SOURCE_LABEL_NAME });
      return; // 已存在
    } catch (err) {
      const status = this.extractStatus(err);
      if (status !== 404) {
        // 非 not-found 錯誤（例如 401 / 網路錯）——往外丟，呼叫端會 log warning
        throw err;
      }
    }
    // 走到這裡代表是 404，建立 label
    try {
      await this.octokit.issues.createLabel({
        owner,
        repo,
        name: SOURCE_LABEL_NAME,
        color: SOURCE_LABEL_COLOR,
        description: SOURCE_LABEL_DESC,
      });
    } catch (err) {
      const status = this.extractStatus(err);
      // 422 代表 concurrent 建立或已存在，視為成功
      if (status !== 422) {
        throw err;
      }
    }
  }

  private async addSourceLabel(
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<void> {
    await this.octokit.issues.addLabels({
      owner,
      repo,
      issue_number: issueNumber,
      labels: [SOURCE_LABEL_NAME],
    });
  }

  /**
   * 把 Octokit 丟出的 RequestError 映射成專案自訂錯誤。
   * 不帶 token 或完整 response body，只保留 status + 簡短原因。
   */
  private mapError(err: unknown): Error {
    const status = this.extractStatus(err);
    const snippet = this.describeError(err);

    // rate limit 可能走 403 + x-ratelimit-remaining: 0 或 429
    if (status === 429 || this.looksLikeRateLimit(err)) {
      this.logger.warn(`GitHub rate limit 觸發：${snippet}`);
      return new RateLimitedError();
    }
    if (status === 401 || status === 403) {
      this.logger.error(`GitHub 認證 / 權限失敗（status=${status}）：${snippet}`);
      return new UpstreamAuthError();
    }
    this.logger.error(`GitHub upstream 失敗（status=${status ?? 'n/a'}）：${snippet}`);
    return new UpstreamError(
      status != null ? `GitHub 回應 ${status}` : 'GitHub 呼叫失敗',
      status,
    );
  }

  /** Octokit RequestError 的 status 欄位；無法判定時回 null。 */
  private extractStatus(err: unknown): number | null {
    if (err && typeof err === 'object' && 'status' in err) {
      const s = (err as { status?: unknown }).status;
      if (typeof s === 'number') return s;
    }
    return null;
  }

  /**
   * 判斷是否 rate limit：
   *   - status === 403 且 x-ratelimit-remaining === '0'
   *   - message 含 'secondary rate limit'
   */
  private looksLikeRateLimit(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const status = this.extractStatus(err);
    const headers =
      'response' in err &&
      err.response &&
      typeof err.response === 'object' &&
      'headers' in err.response
        ? ((err.response as { headers?: Record<string, string> }).headers ?? {})
        : {};
    const remaining = headers['x-ratelimit-remaining'];
    if (status === 403 && remaining === '0') return true;

    const msg =
      'message' in err && typeof (err as { message?: unknown }).message === 'string'
        ? ((err as { message: string }).message)
        : '';
    return /secondary rate limit/i.test(msg);
  }

  /** 只回傳 status + message 片段，避免敏感內容進 log。 */
  private describeError(err: unknown): string {
    const status = this.extractStatus(err);
    const msg =
      err instanceof Error
        ? err.message
        : typeof err === 'string'
          ? err
          : 'unknown error';
    return `status=${status ?? 'n/a'} message=${msg.slice(0, 200)}`;
  }
}
