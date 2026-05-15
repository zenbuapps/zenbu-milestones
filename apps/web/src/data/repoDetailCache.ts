import type { RepoDetail } from 'shared';

/**
 * 客戶端 RepoDetail 快取（issue #26）
 *
 * 設計原則：
 * - 純 in-memory Map，活在單一 SPA tab 的生命週期內；page refresh 後重置
 * - 不設 TTL：後端 DashboardCacheService 已有 5 分鐘 TTL（避免雙層 TTL 推理混亂）；
 *   前端僅做 stale-while-revalidate —— 立即回傳快取，背景重打 API 更新
 * - 顯式 invalidate：使用者點「重新整理」或 admin 觸發 refresh-data 時清空
 *
 * 不引入 React Query 的考量：當前需求僅一個 endpoint、一份資料，
 * 自製 50 行的 Map 足夠覆蓋 SWR + invalidate 兩個關鍵語意；
 * 避免為單一場景拖入整個 library 與其新的型別 / hook 生態。
 */
const cache = new Map<string, RepoDetail>();

const keyOf = (owner: string, name: string): string => `${owner}/${name}`;

export const getCachedRepoDetail = (owner: string, name: string): RepoDetail | undefined =>
  cache.get(keyOf(owner, name));

export const setCachedRepoDetail = (
  owner: string,
  name: string,
  detail: RepoDetail,
): void => {
  cache.set(keyOf(owner, name), detail);
};

export const invalidateRepoDetail = (owner: string, name: string): void => {
  cache.delete(keyOf(owner, name));
};

export const invalidateAllRepoDetails = (): void => {
  cache.clear();
};
