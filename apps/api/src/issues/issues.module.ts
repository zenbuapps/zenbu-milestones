import { Module } from '@nestjs/common';
import { AuditService } from '../admin/audit.service';
import { GitHubModule } from '../github/github.module';
import { IssuesController } from './issues.controller';
import { IssuesService } from './issues.service';

/**
 * IssuesModule
 * ---------------------------------------------------------------
 * IssuesService 會被 MeController（/api/me/issues）與 IssuesController
 * 同時使用，也被 AdminIssuesController 呼叫 approve / reject；因此 exports。
 *
 * imports：
 *   - GitHubModule：approveAndSync 時要代呼 GitHub
 * providers：
 *   - AuditService：就地提供一份實例（避免 IssuesModule ↔ AdminModule 循環依賴）
 *     AuditService 無狀態、依賴 PrismaService，多實例化不會有問題。
 *
 * PrismaService 由 @Global() PrismaModule 提供，這裡不需 imports。
 */
@Module({
  imports: [GitHubModule],
  controllers: [IssuesController],
  providers: [IssuesService, AuditService],
  exports: [IssuesService],
})
export class IssuesModule {}
