import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { ReposController } from './repos.controller';

/**
 * ReposModule
 * ---------------------------------------------------------------
 * 公開（非 admin-guarded）的 repo 相關 API。目前只有 GET /api/repos/settings
 * 給前端 AppShell 決定 Sidebar / OverviewPage 的 visibleOnUI 過濾。
 *
 * 設計上本 module 只擁有 controller；RepoSettingsService 由 AdminModule 擁有並匯出，
 * 避免兩個 module 各自 provide 造成多實例（AuditService 共用）。
 */
@Module({
  imports: [AdminModule],
  controllers: [ReposController],
})
export class ReposModule {}
