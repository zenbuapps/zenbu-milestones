import { Injectable, Logger } from '@nestjs/common';

/** Cache entry：值 + 到期時間戳（epoch ms）。 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/** Dashboard module cache key 的共同 prefix，用於一次清除。 */
export const DASHBOARD_CACHE_PREFIX = 'dashboard:';

/** 預設 TTL：5 分鐘。 */
export const DASHBOARD_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * DashboardCacheService
 * ---------------------------------------------------------------
 * 極簡 in-memory TTL cache，滿足以下需求：
 *   1. `getOrLoad(key, loader, ttlMs?)`：cache hit 直接回傳，miss 才呼叫 loader
 *   2. `deleteByPrefix(prefix)`：一次清掉所有以某 prefix 開頭的 key（refresh-data 用）
 *   3. 自動清理到期 entry（lazy：下次取用時檢查；不啟背景定時器）
 *
 * 為何不用 `@nestjs/cache-manager`：
 *   - cache-manager v7 為 ESM-only 套件（加上底層用 keyv），在本專案 NestJS CJS
 *     環境引入成本不低；且原生 API 不支援「prefix delete」，仍需自己維護 key set。
 *   - 本專案只需單實例 in-memory cache，5 分鐘 TTL + refresh 清除，自實作比較簡潔可控。
 *
 * 如果未來要換成 Redis / multi-instance，再抽介面 + 替換實作。
 */
@Injectable()
export class DashboardCacheService {
  private readonly logger = new Logger(DashboardCacheService.name);
  private readonly store = new Map<string, CacheEntry<unknown>>();

  /**
   * 取得 cache value；未命中或過期則呼叫 loader 取得新值並寫入 cache。
   * loader 的 Promise 失敗會**直接 rethrow**，不污染 cache。
   */
  async getOrLoad<T>(
    key: string,
    loader: () => Promise<T>,
    ttlMs: number = DASHBOARD_CACHE_TTL_MS,
  ): Promise<T> {
    const hit = this.getValid<T>(key);
    if (hit !== undefined) {
      return hit;
    }
    const value = await loader();
    this.set(key, value, ttlMs);
    return value;
  }

  /** 寫入 cache，附 TTL。 */
  set<T>(key: string, value: T, ttlMs: number = DASHBOARD_CACHE_TTL_MS): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /** 取得未過期的 value；已過期 / 不存在 → undefined。 */
  private getValid<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  /**
   * 刪除所有以 prefix 開頭的 key。
   * 回傳實際刪除筆數（含尚未過期的 entry）。
   */
  deleteByPrefix(prefix: string): number {
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        count += 1;
      }
    }
    if (count > 0) {
      this.logger.log(`Cleared ${count} cache key(s) with prefix "${prefix}"`);
    }
    return count;
  }

  /** 僅限測試 / debug；production 不建議呼叫。 */
  size(): number {
    return this.store.size;
  }
}
