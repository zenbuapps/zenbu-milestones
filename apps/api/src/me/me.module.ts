import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IssuesModule } from '../issues/issues.module';
import { MeController } from './me.controller';
import { PinnedReposService } from './pinned-repos.service';

/**
 * MeModule
 * ---------------------------------------------------------------
 * 拉入 AuthModule（AuthService）與 IssuesModule（IssuesService）；
 * PinnedReposService 為本模組自己擁有的 provider（依賴全域 PrismaService）。
 */
@Module({
  imports: [AuthModule, IssuesModule],
  controllers: [MeController],
  providers: [PinnedReposService],
})
export class MeModule {}
