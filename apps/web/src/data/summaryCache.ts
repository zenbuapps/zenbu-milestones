import type { Summary } from 'shared';

/**
 * 把上一次成功取得的 Summary 暫存到 sessionStorage（issue #31）
 *
 * 為什麼用 sessionStorage 而非 localStorage：
 * - 只是為了「重整或回上一頁」時不再從零白屏，session 結束就清掉夠用
 * - 避免 localStorage 跨 session 累積過期或受權限變化影響的舊資料
 *
 * 版本欄位（CACHE_VERSION）：當 shared Summary 介面有 breaking change 時，
 * 升版號讓舊快取自動失效，省得用 try/catch 接形狀錯誤。
 */
const STORAGE_KEY = 'zenbu-roadmaps:summary-cache';
const CACHE_VERSION = 1;

interface CacheEnvelope {
  v: number;
  /** ISO 8601；目前未用於 TTL，但保留方便日後加上 stale 判斷 */
  savedAt: string;
  data: Summary;
}

const isCacheEnvelope = (raw: unknown): raw is CacheEnvelope =>
  !!raw &&
  typeof raw === 'object' &&
  (raw as CacheEnvelope).v === CACHE_VERSION &&
  typeof (raw as CacheEnvelope).savedAt === 'string' &&
  !!(raw as CacheEnvelope).data;

export const readCachedSummary = (): Summary | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isCacheEnvelope(parsed)) return null;
    return parsed.data;
  } catch {
    // sessionStorage 被禁 / JSON 解析失敗 → 視為無快取，不阻斷 UI
    return null;
  }
};

export const writeCachedSummary = (data: Summary): void => {
  if (typeof window === 'undefined') return;
  try {
    const envelope: CacheEnvelope = {
      v: CACHE_VERSION,
      savedAt: new Date().toISOString(),
      data,
    };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // quota / 隱私模式被禁 → 靜默 fallback
  }
};

export const clearCachedSummary = (): void => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
};
