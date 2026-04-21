import { Module } from '@nestjs/common';
import { GitHubModule } from '../github/github.module';
import { AdminDashboardController } from './admin-dashboard.controller';
import { DashboardCacheService } from './dashboard-cache.service';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { GitHubHealthController } from './github-health.controller';

/**
 * DashboardModule
 * ---------------------------------------------------------------
 * Phase 2 runtime API 的集中點。包含：
 *
 *   Controllers
 *     - DashboardController        → GET /api/summary
 *                                     GET /api/repos/:owner/:name/detail
 *                                     GET /api/repos/:owner/:name/milestones/:number/issues
 *                                    （登入保護）
 *     - GitHubHealthController     → GET /api/health/github  （公開，對齊既有 HealthController）
 *     - AdminDashboardController   → POST /api/admin/refresh-data  （AdminGuard）
 *
 *   Providers
 *     - DashboardService           → 取 GitHub + 投影成 shared 型別
 *     - DashboardCacheService      → in-memory TTL cache + prefix delete
 *
 *   Imports
 *     - GitHubModule               → 提供 GitHubService（已存在，不重複 provide）
 *
 * 為何 admin refresh-data 不放進 `AdminModule`：
 *   - 該 endpoint 的依賴是 `DashboardCacheService`（屬於 dashboard 領域），
 *     把 controller 放 dashboard 側能維持模組邊界清晰、避免 AdminModule 再多一條
 *     與 dashboard cache 的耦合。
 *   - 等價地，github health 也放 dashboard 側，因為它依賴已經 import 的 GitHubModule。
 */
@Module({
  imports: [GitHubModule],
  controllers: [
    DashboardController,
    GitHubHealthController,
    AdminDashboardController,
  ],
  providers: [DashboardService, DashboardCacheService],
})
export class DashboardModule {}
