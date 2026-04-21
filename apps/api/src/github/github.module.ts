import { Module } from '@nestjs/common';
import { GitHubService } from './github.service';

/**
 * GitHubModule
 * ---------------------------------------------------------------
 * 將 GitHubService 封裝成可注入 provider。AdminModule 會 import 它，
 * 在 approveAndSync 流程中代呼 GitHub REST API。
 *
 * 設計：不標 @Global()，因為目前只有 AdminModule 會用到；若之後有
 * 其他 service 需要代呼 GitHub，再決定是否全域化。
 */
@Module({
  providers: [GitHubService],
  exports: [GitHubService],
})
export class GitHubModule {}
