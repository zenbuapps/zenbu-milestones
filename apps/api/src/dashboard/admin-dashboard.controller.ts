import {
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { RefreshDataResult } from 'shared';
import { AdminGuard } from '../common/guards/admin.guard';
import {
  DASHBOARD_CACHE_PREFIX,
  DashboardCacheService,
} from './dashboard-cache.service';

interface ApiSuccess<T> {
  success: true;
  data: T;
}

/** refresh 最小間隔：10 秒。避免 admin 連點癱 GitHub。 */
const REFRESH_MIN_INTERVAL_MS = 10_000;

/**
 * AdminDashboardController
 * ---------------------------------------------------------------
 * POST /api/admin/refresh-data
 *
 * 清掉 dashboard cache —— 下次 GET /api/summary / /api/repos/... 會重新打 GitHub。
 * 僅限 admin（AdminGuard：未登入 401、非 admin 403）。
 *
 * Debounce 策略：
 *   - 以 module-scoped 變數 `lastRefreshAt` 記錄上次成功時間
 *   - 10 秒內再打 → 429（Too Many Requests），不執行
 *   - 不用 rate-limit 套件，避免為單一 endpoint 引入額外相依
 *
 * 回傳 envelope 對齊 AdminIssuesController：`{ success: true, data: RefreshDataResult }`。
 */
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminDashboardController {
  private readonly logger = new Logger(AdminDashboardController.name);
  private lastRefreshAt = 0;

  constructor(private readonly cache: DashboardCacheService) {}

  @Post('refresh-data')
  @HttpCode(HttpStatus.OK)
  refresh(): ApiSuccess<RefreshDataResult> {
    const now = Date.now();
    const elapsed = now - this.lastRefreshAt;
    if (this.lastRefreshAt > 0 && elapsed < REFRESH_MIN_INTERVAL_MS) {
      const retryAfterSec = Math.ceil(
        (REFRESH_MIN_INTERVAL_MS - elapsed) / 1000,
      );
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'REFRESH_TOO_SOON',
            message: `請稍候 ${retryAfterSec} 秒再重試（10 秒冷卻中）`,
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const clearedKeys = this.cache.deleteByPrefix(DASHBOARD_CACHE_PREFIX);
    this.lastRefreshAt = now;
    const clearedAt = new Date(now).toISOString();
    this.logger.log(
      `Cache refreshed: clearedKeys=${clearedKeys} clearedAt=${clearedAt}`,
    );
    return {
      success: true,
      data: { clearedKeys, clearedAt },
    };
  }
}
