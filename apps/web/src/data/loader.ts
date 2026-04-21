import type { RepoDetail, Summary } from './types';

/**
 * 模組內快取，避免相同資源重複 fetch。
 * key 對應資源路徑（相對於 data 目錄）。
 */
const cache = new Map<string, unknown>();

/**
 * 以 Vite 的 BASE_URL 拼出實際的 data 路徑
 * @param path data 目錄底下的相對路徑（不以 / 開頭）
 */
const resolveDataUrl = (path: string): string => {
  const base = import.meta.env.BASE_URL;
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}data/${path}`;
};

/**
 * 通用 JSON 讀取邏輯，含快取與錯誤包裝
 */
const fetchJson = async <T>(path: string): Promise<T> => {
  if (cache.has(path)) {
    return cache.get(path) as T;
  }

  const url = resolveDataUrl(path);
  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new Error(`[loader] 無法連線讀取 ${url}：${(err as Error).message}`);
  }

  if (!response.ok) {
    throw new Error(
      `[loader] 讀取 ${url} 失敗（HTTP ${response.status} ${response.statusText}）`,
    );
  }

  let json: T;
  try {
    json = (await response.json()) as T;
  } catch (err) {
    throw new Error(
      `[loader] 解析 ${url} JSON 失敗：${(err as Error).message}`,
    );
  }

  cache.set(path, json);
  return json;
};

/**
 * 讀取全域 summary.json（所有 repo 的總覽資料）
 */
export const loadSummary = (): Promise<Summary> => fetchJson<Summary>('summary.json');

/**
 * 讀取單一 repo 的詳細 milestone/issue 資料
 * @param name repo 名稱（例如 "wp-power-course"）
 */
export const loadRepoDetail = (name: string): Promise<RepoDetail> =>
  fetchJson<RepoDetail>(`repos/${name}.json`);

/** 測試或手動需求時清空快取（正式流程用不到） */
export const clearDataCache = (): void => {
  cache.clear();
};
