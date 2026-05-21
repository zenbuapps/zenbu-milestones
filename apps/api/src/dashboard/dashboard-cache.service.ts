import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

/** Dashboard module cache key 的共同 prefix，用於一次清除。 */
export const DASHBOARD_CACHE_PREFIX = 'dashboard:';

/** 預設 TTL：5 分鐘。 */
export const DASHBOARD_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * DashboardCacheService
 * ---------------------------------------------------------------
 * Redis-backed TTL cache，滿足以下需求：
 *   1. `getOrLoad(key, loader, ttlMs?)`：cache hit 直接回傳，miss 才呼叫 loader
 *   2. `deleteByPrefix(prefix)`：一次清掉所有以某 prefix 開頭的 key（refresh-data 用）
 *   3. TTL 由 Redis 原生管理（PX 毫秒模式），不需 lazy eviction
 *
 * 公開介面與舊版 in-memory 實作完全相同，消費端（DashboardService、
 * DashboardController、AdminDashboardController）不需改動。
 */
@Injectable()
export class DashboardCacheService {
  constructor(private readonly redis: RedisService) {}

  /**
   * 取得 cache value；未命中或過期則呼叫 loader 取得新值並寫入 cache。
   * loader 的 Promise 失敗會**直接 rethrow**，不污染 cache。
   */
  async getOrLoad<T>(
    key: string,
    loader: () => Promise<T>,
    ttlMs: number = DASHBOARD_CACHE_TTL_MS,
  ): Promise<T> {
    const hit = await this.redis.get<T>(key);
    if (hit !== null) {
      return hit;
    }
    const value = await loader();
    await this.redis.set(key, value, ttlMs);
    return value;
  }

  /** 寫入 cache，附 TTL。 */
  async set<T>(key: string, value: T, ttlMs: number = DASHBOARD_CACHE_TTL_MS): Promise<void> {
    await this.redis.set(key, value, ttlMs);
  }

  /**
   * 刪除所有以 prefix 開頭的 key。
   * 回傳實際刪除筆數。
   */
  async deleteByPrefix(prefix: string): Promise<number> {
    return this.redis.deleteByPrefix(prefix);
  }
}
