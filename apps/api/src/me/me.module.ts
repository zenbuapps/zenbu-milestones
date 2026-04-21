import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IssuesModule } from '../issues/issues.module';
import { MeController } from './me.controller';

/**
 * MeModule
 * ---------------------------------------------------------------
 * 拉入 AuthModule（AuthService）與 IssuesModule（IssuesService）即可；
 * 本模組自己不帶 provider。
 */
@Module({
  imports: [AuthModule, IssuesModule],
  controllers: [MeController],
})
export class MeModule {}
