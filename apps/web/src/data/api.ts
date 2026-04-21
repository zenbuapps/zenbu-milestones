/**
 * Worker client — 前端呼叫 NestJS 後端的 thin wrapper。
 *
 * 設計原則：
 * - 所有請求自動帶 credentials: 'include' 以攜帶 session cookie
 * - VITE_API_BASE_URL 未設定時 `isApiConfigured()` 回 false，呼叫端應自行 graceful degrade
 * - 回傳 shape 統一為 `{ success: true, data: T }` 或 `{ success: false, error: { code, message } }`
 */

import type {
  AdminIssueRow,
  AdminUserRow,
  AuditLogRow,
  IssueStatus,
  PublicRepoSettingsRow,
  RejectIssueInput,
  RepoSettingsRow,
  SubmittedIssueDTO,
  UpdateRepoSettingsInput,
  UpdateUserRoleInput,
  UserRole,
} from 'shared';

export class ApiError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

const RAW_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;
const API_BASE = RAW_BASE ? RAW_BASE.replace(/\/$/, '') : null;

/** 後端 API 是否已設定（dev / prod build 時注入 VITE_API_BASE_URL 才為 true） */
export const isApiConfigured = (): boolean => API_BASE !== null;

/** 登入 / 登出入口（redirect full page，不走 fetch） */
export const authUrls = {
  login: () => (API_BASE ? `${API_BASE}/api/auth/google` : null),
  logout: () => (API_BASE ? `${API_BASE}/api/auth/logout` : null),
};

type Envelope<T> = { success: true; data: T } | { success: false; error: { code: string; message: string } };

/**
 * 通用 fetch：
 * - 帶 credentials: 'include'
 * - non-2xx 或 success:false → throw ApiError
 * - 2xx 且 success:true → 回傳 data
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE) {
    throw new ApiError('API_NOT_CONFIGURED', '尚未設定後端 API（VITE_API_BASE_URL）', 0);
  }

  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let res: Response;
  try {
    res = await fetch(url, { ...init, credentials: 'include', headers });
  } catch (networkErr) {
    throw new ApiError('NETWORK_ERROR', (networkErr as Error).message || '網路錯誤', 0);
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON response：保留 null
  }

  if (!res.ok) {
    const env = body as Envelope<T> | null;
    if (env && !env.success) {
      throw new ApiError(env.error.code, env.error.message, res.status);
    }
    throw new ApiError(`HTTP_${res.status}`, res.statusText || 'Request failed', res.status);
  }

  // 成功但 body 不是 envelope（例如 /api/me 直接回 SessionUserDTO）
  const env = body as Envelope<T> | null;
  if (env && typeof env === 'object' && 'success' in env) {
    if (env.success) return env.data;
    throw new ApiError(env.error.code, env.error.message, res.status);
  }
  return body as T;
}

/** 建立 issue 草稿時傳給後端的 payload 形狀 */
export interface CreateIssueInput {
  /** 標題（1..ISSUE_TITLE_MAX） */
  title: string;
  /** Markdown 內容（1..ISSUE_BODY_MAX） */
  body: string;
  /** Repo 所有者（通常為 'zenbuapps'） */
  repoOwner: string;
  /** Repo 名稱 */
  repoName: string;
}

/**
 * 提交 issue 草稿
 * 走 `POST /api/issues`；後端會驗證 session + repo settings + rate limit。
 * 失敗時 throw `ApiError`（呼叫端依 `code` / `httpStatus` 對應文案）。
 */
export async function createIssue(input: CreateIssueInput): Promise<SubmittedIssueDTO> {
  return apiFetch<SubmittedIssueDTO>('/api/issues', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/**
 * 取得當前登入者自己提交過的 issue 列表
 * 走 `GET /api/me/issues`（未登入回 401，呼叫端以 ApiError.httpStatus 判斷）
 * 後端依 createdAt desc 排序
 */
export async function fetchMyIssues(): Promise<SubmittedIssueDTO[]> {
  return apiFetch<SubmittedIssueDTO[]>('/api/me/issues');
}

/**
 * 公開 repo 設定（anonymous 可讀）。
 * 前端 AppShell 用此決定 Sidebar / OverviewPage 要不要顯示某 repo。
 *
 * 失敗策略：fetch 壞掉（後端未部署 / API_BASE 未設 / 網路錯）一律回 `[]`，
 * 讓頁面 graceful degrade 為「顯示所有 summary.json 內的 repo」—— 純前端靜態站
 * 仍可運作，避免後端不可用時整個儀表板跟著掛。
 */
export async function fetchPublicRepoSettings(): Promise<PublicRepoSettingsRow[]> {
  if (!isApiConfigured()) return [];
  try {
    return await apiFetch<PublicRepoSettingsRow[]>('/api/repos/settings');
  } catch {
    return [];
  }
}

// ===========================================================================
// Admin API — M4
// ===========================================================================

/** `GET /api/admin/issues` 的 status 查詢參數 */
export type AdminIssueStatusFilter = IssueStatus | 'all';

/**
 * 取得所有 issue（可依 status 過濾）
 * 僅限 role=admin；未登入 → 401；非 admin → 403
 */
export async function fetchAdminIssues(
  status: AdminIssueStatusFilter = 'all',
): Promise<AdminIssueRow[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiFetch<AdminIssueRow[]>(`/api/admin/issues${query}`);
}

/**
 * 審核通過單筆 issue 的回傳形狀
 *
 * 特殊：即使 HTTP 2xx，`success` 可能為 false（DB 已更新但 GitHub 轉送失敗）。
 * 呼叫端必須同時看 `data`（用於 UI 更新）與 `error`（用於顯示「已 approved 但 GitHub 失敗」）。
 */
export interface ApproveAdminIssueResult {
  /** 最新 issue row（無論成功失敗都可拿來就地更新列表） */
  data: AdminIssueRow;
  /** null 代表完全成功（已轉 GitHub）；非 null 代表 DB 已 approved 但轉送失敗 */
  error: { code: string; message: string } | null;
}

/**
 * 審核通過單筆 issue
 *
 * 特殊處理（plan.md §M4 明文規範）：
 * - 後端可能回 200 + `{ success: false, error, data }`（GitHub 失敗但 DB 已標 approved）
 * - 此情況 **不能** 走 apiFetch 的 envelope unwrap（它會 throw ApiError）
 * - 改為自己 fetch，2xx 都解 body，把 data + error 同時回傳
 * - non-2xx（401 / 403 / 404 / 500 等）仍 throw ApiError
 */
export async function approveAdminIssue(id: string): Promise<ApproveAdminIssueResult> {
  if (!API_BASE) {
    throw new ApiError('API_NOT_CONFIGURED', '尚未設定後端 API（VITE_API_BASE_URL）', 0);
  }

  const url = `${API_BASE}/api/admin/issues/${encodeURIComponent(id)}/approve`;

  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', credentials: 'include' });
  } catch (networkErr) {
    throw new ApiError('NETWORK_ERROR', (networkErr as Error).message || '網路錯誤', 0);
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON response：保留 null
  }

  if (!res.ok) {
    const env = body as Envelope<AdminIssueRow> | null;
    if (env && !env.success) {
      throw new ApiError(env.error.code, env.error.message, res.status);
    }
    throw new ApiError(`HTTP_${res.status}`, res.statusText || 'Request failed', res.status);
  }

  // 2xx：解出 data 與 error，兩者都可能存在（GitHub 失敗時 success=false 仍帶 data）
  type ApproveEnvelope =
    | { success: true; data: AdminIssueRow }
    | { success: false; error: { code: string; message: string }; data: AdminIssueRow };

  const env = body as ApproveEnvelope | null;
  if (!env || typeof env !== 'object' || !('success' in env) || !('data' in env)) {
    throw new ApiError('INVALID_RESPONSE', '後端回應格式錯誤', res.status);
  }

  return {
    data: env.data,
    error: env.success ? null : env.error ?? null,
  };
}

/**
 * 拒絕單筆 issue（寫入 rejectReason）
 */
export async function rejectAdminIssue(id: string, reason: string): Promise<AdminIssueRow> {
  const payload: RejectIssueInput = { reason };
  return apiFetch<AdminIssueRow>(`/api/admin/issues/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * 取得所有 repo 的投稿設定
 */
export async function fetchAdminRepos(): Promise<RepoSettingsRow[]> {
  return apiFetch<RepoSettingsRow[]>('/api/admin/repos');
}

/**
 * 更新單一 repo 的投稿 / 顯示設定（部分欄位）
 */
export async function updateAdminRepoSettings(
  owner: string,
  name: string,
  patch: UpdateRepoSettingsInput,
): Promise<RepoSettingsRow> {
  return apiFetch<RepoSettingsRow>(
    `/api/admin/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    },
  );
}

/**
 * 取得所有使用者清單（admin 管理用）
 */
export async function fetchAdminUsers(): Promise<AdminUserRow[]> {
  return apiFetch<AdminUserRow[]>('/api/admin/users');
}

/**
 * 變更指定使用者的 role
 * 後端特殊 403：不可改自己的 role、不可撤銷最後一位 admin
 */
export async function updateAdminUserRole(id: string, role: UserRole): Promise<AdminUserRow> {
  const payload: UpdateUserRoleInput = { role };
  return apiFetch<AdminUserRow>(`/api/admin/users/${encodeURIComponent(id)}/role`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/**
 * 取得最近 N 筆稽核 log（預設 50）
 */
export async function fetchAuditLogs(limit: number = 50): Promise<AuditLogRow[]> {
  const query = `?limit=${encodeURIComponent(String(limit))}`;
  return apiFetch<AuditLogRow[]>(`/api/admin/audit-logs${query}`);
}
