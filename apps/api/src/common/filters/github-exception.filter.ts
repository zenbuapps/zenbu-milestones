import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Response } from 'express';
import {
  GitHubError,
  RateLimitedError,
  UpstreamAuthError,
} from '../../github/github.errors';

/**
 * GithubExceptionFilter
 * ---------------------------------------------------------------
 * NestJS 預設 ExceptionsHandler 對 unknown Error 一律回 500
 * `{ statusCode: 500, message: 'Internal server error' }`，導致 GitHub 上游
 * 失敗（PAT 過期、rate limit）時前端看到的訊息毫無頭緒。
 *
 * 這個 filter 只負責處理 `GitHubError` 階層：
 *   - UpstreamAuthError  → 502 Bad Gateway     code: UPSTREAM_AUTH
 *   - RateLimitedError   → 429 Too Many Reqs   code: UPSTREAM_RATE_LIMIT
 *   - UpstreamError 等   → 502 Bad Gateway     code: UPSTREAM_ERROR
 *
 * 一律輸出與 web 端 `Envelope` 對齊的 shape：
 *   { success: false, error: { code, message } }
 *
 * 不影響其他 endpoint（HttpException、validation 失敗、admin/issues 自定的
 * 200 + success:false 等），其餘交給 NestJS 預設處理。
 */
@Catch(GitHubError)
export class GithubExceptionFilter implements ExceptionFilter<GitHubError> {
  private readonly logger = new Logger(GithubExceptionFilter.name);

  catch(exception: GitHubError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    let status: number;
    let code: string;

    if (exception instanceof UpstreamAuthError) {
      status = 502;
      code = 'UPSTREAM_AUTH';
    } else if (exception instanceof RateLimitedError) {
      status = 429;
      code = 'UPSTREAM_RATE_LIMIT';
    } else {
      status = 502;
      code = 'UPSTREAM_ERROR';
    }

    this.logger.warn(
      `${exception.name} → HTTP ${status} (${code}): ${exception.message}`,
    );

    res.status(status).json({
      success: false,
      error: {
        code,
        message: exception.message,
      },
    });
  }
}
