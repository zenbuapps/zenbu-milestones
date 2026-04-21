import { Controller, Get } from '@nestjs/common';
import type { PublicRepoSettingsRow } from 'shared';
import { RepoSettingsService } from '../admin/repo-settings.service';

interface ApiSuccess<T> {
  success: true;
  data: T;
}

/**
 * ReposController
 * ---------------------------------------------------------------
 * 公開（anonymous）端點。前端 AppShell 在 mount 時 fetch 一次取得
 * 所有 repo 的「是否顯示於 UI / 是否允許投稿」兩個 boolean，讓 admin
 * 在後台 toggle visibleOnUI 後，Sidebar / OverviewPage / RoadmapPage 能
 * **即時**反映（不需等下一輪 fetcher cron）。
 *
 * 安全：
 *   - 不暴露 updatedBy email 等管理員身份資訊
 *   - 不需登入（unauthenticated 亦可讀）
 *   - 屬於 read-only 公開資料（類似 summary.json 的語意）
 */
@Controller('repos')
export class ReposController {
  constructor(private readonly repoSettingsService: RepoSettingsService) {}

  @Get('settings')
  async listSettings(): Promise<ApiSuccess<PublicRepoSettingsRow[]>> {
    const data = await this.repoSettingsService.listPublic();
    return { success: true, data };
  }
}
