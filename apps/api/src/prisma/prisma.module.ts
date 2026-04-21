import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * PrismaModule
 * ---------------------------------------------------------------
 * 標記為 @Global 以省去每個 feature module 重複 imports。
 * 任何需要資料存取的 service 只要建構子 inject `PrismaService`
 * 即可，不必再 import PrismaModule。
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
