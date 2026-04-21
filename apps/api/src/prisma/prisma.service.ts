import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService
 * ---------------------------------------------------------------
 * 封裝 Prisma Client 的生命週期管理。
 *
 * - onModuleInit：Nest 啟動時建立連線；失敗就直接 throw 讓 bootstrap 中止
 * - onModuleDestroy：Nest 關閉時正常斷線，避免連線洩漏
 *
 * 不直接匯出 PrismaClient，避免繞過 DI 容器。所有 repository / service
 * 必須 inject 此 service。
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
