/**
 * GitHub 錯誤階層
 * ---------------------------------------------------------------
 * controller 層以 `instanceof GitHubError` 統一 catch，再依具體子類型
 * 映射到對外的 error code（UPSTREAM_ERROR / RATE_LIMITED / UPSTREAM_AUTH_ERROR）。
 *
 * 原則：
 *   - 建構時刻意不夾帶 token / 完整 response body，避免敏感資訊外洩到 log
 *   - 保留 status / 簡短 message 讓運維可追蹤
 */

/** GitHub 相關錯誤的 base class；用於 catch 所有 upstream 失敗。 */
export class GitHubError extends Error {
  public readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
  }
}

/** 認證失敗（401 / 403 非 rate limit 型）—— 通常代表 PAT 失效或權限不足。 */
export class UpstreamAuthError extends GitHubError {
  constructor(message = 'GitHub 認證失敗，請檢查 ZENBU_ORG_WRITE_TOKEN') {
    super(message, 401);
    this.name = 'UpstreamAuthError';
  }
}

/** 被 GitHub rate limit 擋下（primary 或 secondary）。 */
export class RateLimitedError extends GitHubError {
  constructor(message = 'GitHub API 速率限制，請稍後再試') {
    super(message, 429);
    this.name = 'RateLimitedError';
  }
}

/** 其他上游錯誤（5xx、4xx schema 錯等）。 */
export class UpstreamError extends GitHubError {
  constructor(message = 'GitHub 服務暫時異常', status: number | null = null) {
    super(message, status);
    this.name = 'UpstreamError';
  }
}
