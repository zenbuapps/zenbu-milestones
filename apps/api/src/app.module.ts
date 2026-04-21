import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { IssuesModule } from './issues/issues.module';
import { MeModule } from './me/me.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

/**
 * AppModule
 * ---------------------------------------------------------------
 * 根模組，只負責「組裝」—— 不含商業邏輯。
 *
 * Env 載入策略（刻意偏離 plan.md 預設）：
 *   - envFilePath: ['../../.env']
 *     .env 放在 monorepo root，避免每個 app 各自維護。
 *     相對路徑以「Node process 的 cwd」解析 —— Nest CLI / dotenv-cli
 *     在 apps/api 下啟動時，往上兩層剛好是 repo root。
 *   - isGlobal: true —— ConfigService 全域可注入，不必每個 module 再 import。
 *   - cache: true —— 啟動時讀一次即可，runtime 不再查檔。
 *
 * 注意：start script 同時用 dotenv-cli 包一層，讓「Nest 啟動前」就有環境變數，
 *       確保 PrismaClient、passport-google-oauth20 等 construct 階段讀 env 的
 *       套件也能拿到值。
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['../../.env'],
    }),
    PrismaModule,
    UsersModule,
    AuthModule,
    IssuesModule,
    MeModule,
    AdminModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
