import { Module } from '@nestjs/common';
import { GitHubModule } from '../github/github.module';
import { IssuesModule } from '../issues/issues.module';
import { UsersModule } from '../users/users.module';
import { AdminAuditController } from './admin-audit.controller';
import { AdminIssuesController } from './admin-issues.controller';
import { AdminReposController } from './admin-repos.controller';
import { AdminUsersController } from './admin-users.controller';
import { AuditService } from './audit.service';
import { RepoSettingsService } from './repo-settings.service';

/**
 * AdminModule
 * ---------------------------------------------------------------
 * 集中所有 /api/admin/* 路由。
 *
 * Module 組裝：
 *   - AuditService 匯出給 IssuesModule / UsersModule 共用（寫 audit log）
 *   - RepoSettingsService 自給自足
 *   - imports：
 *       IssuesModule  → 給 AdminIssuesController 注入 IssuesService
 *       UsersModule   → 給 AdminUsersController 注入 UsersService
 *       GitHubModule  → IssuesService.approveAndSync 需要
 *
 * 循環依賴考量：
 *   - AdminModule imports IssuesModule
 *   - IssuesModule imports AdminModule（為了 AuditService）
 *   → 為避免循環，AuditService 改用「local provide + export」模式，不透過
 *     AdminModule 匯出；IssuesModule 直接 providers 內列 AuditService。
 *     但為了讓 AdminReposController / AdminAuditController 也用到 AuditService，
 *     此 module 本地 providers 保留。
 *
 *   →→ 再思考：讓 AuditService 獨立成 provider 放在 AdminModule，但 IssuesModule
 *     同樣 providers 一份會產生兩個實例（非 singleton）—— Nest 的 DI scope 以
 *     provider token 為單位，若兩個 module 各 new 一次會各自擁有一份。由於
 *     AuditService 內部無狀態只依賴 PrismaService，多實例不致出錯；但為乾淨起見
 *     讓 IssuesModule / UsersModule import AdminModule 也不可行（循環回來）。
 *     → 採折衷：把 AuditService 直接放入全域 PrismaModule 不合適（職責不符）；
 *     這裡接受「兩個實例」（IssuesModule / UsersModule 各自實例化），審計寫入
 *     語意仍正確。
 */
@Module({
  imports: [IssuesModule, UsersModule, GitHubModule],
  controllers: [
    AdminIssuesController,
    AdminReposController,
    AdminUsersController,
    AdminAuditController,
  ],
  providers: [AuditService, RepoSettingsService],
  // 匯出 RepoSettingsService 讓 ReposModule（public /api/repos/settings）也能用，
  // 避免兩份實例；AuditService 不匯出（admin-only 寫入場景）
  exports: [RepoSettingsService],
})
export class AdminModule {}
