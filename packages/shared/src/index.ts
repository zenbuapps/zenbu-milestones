/**
 * shared — 跨前後端共用的型別與常數。
 *
 * 原則：
 * - 只放 type / interface / enum 與純常數（字串、陣列、物件字面量）
 * - 絕不引入第三方依賴（保持 zero-dep，前後端都能無痛 import）
 * - 執行期邏輯（驗證、計算）留在各自 app
 */

export type IssueStatus = 'pending' | 'approved' | 'rejected' | 'synced-to-github';

export type UserRole = 'user' | 'admin';

export type AttachmentKind = 'image' | 'video' | 'other';

export interface SubmittedIssueDTO {
  id: string;
  authorId: string;
  repoOwner: string;
  repoName: string;
  title: string;
  bodyMarkdown: string;
  status: IssueStatus;
  githubIssueNumber: number | null;
  githubIssueUrl: string | null;
  rejectReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionUserDTO {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: UserRole;
}

export const ISSUE_TITLE_MAX = 256;
export const ISSUE_BODY_MAX = 50_000;

// ===========================================================================
// Admin DTOs — M4
// ===========================================================================

/**
 * 管理員審核列表中的單筆 issue。
 * 為了審核介面一目了然，聚合作者資訊與 body 預覽。
 */
export interface AdminIssueRow {
  id: string;
  title: string;
  bodyPreview: string; // 前 200 字的預覽（避免一次載全部）
  repoOwner: string;
  repoName: string;
  status: IssueStatus;
  author: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
  };
  githubIssueNumber: number | null;
  githubIssueUrl: string | null;
  rejectReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 審核通過請求：無 body，直接 POST /api/admin/issues/{id}/approve */

/** 審核拒絕請求 body */
export interface RejectIssueInput {
  /** 給提交者看的原因（必填 1..1000 字） */
  reason: string;
}

/**
 * Repo 設定列表單列。
 * M4 UI 以 toggle 呈現 canSubmitIssue / visibleOnUI 兩欄。
 */
export interface RepoSettingsRow {
  id: string;
  repoOwner: string;
  repoName: string;
  canSubmitIssue: boolean;
  visibleOnUI: boolean;
  updatedBy: { id: string; email: string; displayName: string } | null;
  updatedAt: string;
}

export interface UpdateRepoSettingsInput {
  canSubmitIssue?: boolean;
  visibleOnUI?: boolean;
}

/**
 * Public repo settings（匿名訪客也能讀）
 * 僅含前端用來決定「要不要顯示這個 repo」以及「能否在此 repo 投稿」所需的最少欄位
 * 敏感欄位（updatedBy email 等）不外露
 */
export interface PublicRepoSettingsRow {
  repoOwner: string;
  repoName: string;
  canSubmitIssue: boolean;
  visibleOnUI: boolean;
}

/** 使用者管理列表單列 */
export interface AdminUserRow {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: UserRole;
  createdAt: string;
}

export interface UpdateUserRoleInput {
  role: UserRole;
}

// ===========================================================================
// Uploads — M5
// ===========================================================================

/** 上傳圖片成功後後端回的形狀 */
export interface UploadImageResponse {
  /** 公開可瀏覽的 CDN URL（前端塞進 markdown 用） */
  url: string;
  /** 原始檔名（給 alt text 用） */
  filename: string;
  /** 圖片 MIME type */
  mimeType: string;
  /** 檔案大小（bytes） */
  sizeBytes: number;
}

export const UPLOAD_IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const UPLOAD_IMAGE_ALLOWED_MIME = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const;
export type UploadImageMime = (typeof UPLOAD_IMAGE_ALLOWED_MIME)[number];

/**
 * 稽核 log 的 target 資訊（issue #25）
 * - 後端在列出 audit log 時 join Issue / User table，把人類可讀的標題與
 *   連結資料一併吐回；前端據此渲染可點擊的 issue 標題、user email 等
 * - issue 對應的紀錄若已 hard-delete（withdraw 流程），各欄位 fallback 自 payload
 *   仍取不到時為 null（前端顯示 fallback 文字）
 */
export type AuditLogTarget =
  | {
      kind: 'issue';
      title: string | null;
      githubIssueNumber: number | null;
      githubIssueUrl: string | null;
      repoOwner: string | null;
      repoName: string | null;
    }
  | { kind: 'user'; email: string | null; displayName: string | null }
  | { kind: 'repo'; repoOwner: string; repoName: string }
  | { kind: 'other'; label: string };

/** 稽核 log 單筆 */
export interface AuditLogRow {
  id: string;
  action: string; // 'role.grant' | 'role.revoke' | 'repo.update' | 'issue.approve' | 'issue.reject'
  actor: { id: string; email: string; displayName: string };
  targetType: string;
  targetId: string;
  /** 由後端 join 後填入，前端據此渲染人類可讀的目標（issue #25）*/
  target: AuditLogTarget;
  payload: unknown;
  createdAt: string;
}

// ===========================================================================
// Dashboard data — roadmaps / issues / repo summary
// ===========================================================================
// 原位於 apps/web/src/data/types.ts（Phase 2 搬入 shared 成為前後端共同契約）。
// 後端 /api/summary、/api/repos/:owner/:name/detail、/api/repos/:owner/:name/roadmaps/:number/issues
// 的 response 皆以這些 interface 為準。

/** GitHub Roadmap 原生狀態 */
export type RoadmapState = 'open' | 'closed';

/** UI 使用的分類狀態，由後端 / SPA 依 state + dueOn + issue 計數推導 */
export type RoadmapDerivedStatus = 'done' | 'in_progress' | 'overdue' | 'no_due';

/** Summary 層級的整體統計 */
export interface Totals {
  /** 至少有一個 roadmap 的 repo 數 */
  repos: number;
  /** 掃到的所有 repo 數（含沒有 roadmap 的） */
  allRepos: number;
  roadmaps: number;
  openRoadmaps: number;
  closedRoadmaps: number;
  overdueRoadmaps: number;
  /** issue #16：全 GitHub issue 計數（不限掛 milestone 的），sum of repos[].openIssues */
  openIssues: number;
  /** issue #16：全 GitHub issue 計數（不限掛 milestone 的），sum of repos[].closedIssues */
  closedIssues: number;
}

/** Repo 在 Overview 頁的 Card 視圖資料。為了節省傳輸量不含完整 roadmaps */
export interface RepoSummary {
  /** Repo 名稱（不含 owner，owner 隱含為 zenbuapps）*/
  name: string;
  description: string | null;
  htmlUrl: string;
  isPrivate: boolean;
  language: string | null;
  /** ISO 8601 */
  updatedAt: string;
  roadmapCount: number;
  openRoadmapCount: number;
  closedRoadmapCount: number;
  overdueCount: number;
  /** 0–1；若 roadmapCount === 0 回傳 0（不是 null）*/
  completionRate: number;
  /** issue #16：該 repo 的全部 open issues（不限掛 milestone）；排除 PR */
  openIssues: number;
  /** issue #16：該 repo 的全部 closed issues（不限掛 milestone）；排除 PR */
  closedIssues: number;
  /** null 代表沒有「未來到期」的 roadmap */
  nextDueRoadmap: NextDueRoadmap | null;
}

/** RepoSummary.nextDueRoadmap 的內容 */
export interface NextDueRoadmap {
  number: number;
  title: string;
  /** ISO 8601 */
  dueOn: string;
  htmlUrl: string;
}

/** `GET /api/summary` response / 舊 summary.json 的形狀 */
export interface Summary {
  /** ISO 8601，snapshot 產生時間 */
  generatedAt: string;
  totals: Totals;
  /** 排序：roadmapCount > 0 的優先，其次以 name.localeCompare() 字母序 */
  repos: RepoSummary[];
}

/** Issue 的 label（色碼為 6 位 hex，無 `#` 前綴，預設 '888888'） */
export interface IssueLabel {
  name: string;
  /** 6-hex 色碼，例如 'ff0000'（不含 #） */
  color: string;
}

/** Issue 的壓縮視圖（排除 PR、排除 SENSITIVE_LABELS 後由後端吐出） */
export interface IssueLite {
  number: number;
  title: string;
  state: 'open' | 'closed';
  /** labels[].name 保證非空；fetcher 已過濾 */
  labels: IssueLabel[];
  /** GitHub usernames（不含 @）*/
  assignees: string[];
  htmlUrl: string;
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 */
  updatedAt: string;
  /** ISO 8601；state='open' 時為 null */
  closedAt: string | null;
  /** Issue body markdown 原文；GitHub 回傳 null 或空字串時為 null */
  body: string | null;
}

/** 單個 roadmap 的完整資料（含 issues） */
export interface Roadmap {
  number: number;
  title: string;
  description: string | null;
  state: RoadmapState;
  /** ISO 8601；沒設到期日為 null */
  dueOn: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  /** GitHub 原始計數（不受 SENSITIVE_LABELS 過濾影響） */
  openIssues: number;
  closedIssues: number;
  /** closedIssues / (openIssues + closedIssues)；空 roadmap 回 0（不是 null） */
  completion: number;
  htmlUrl: string;
  /** 已過濾 PR 與 SENSITIVE_LABELS 後的 issue 陣列 */
  issues: IssueLite[];
}

/** `GET /api/repos/:owner/:name/detail` response / 舊 repos/{name}.json 的形狀 */
export interface RepoDetail {
  name: string;
  description: string | null;
  htmlUrl: string;
  isPrivate: boolean;
  language: string | null;
  /** ISO 8601 */
  updatedAt: string;
  roadmaps: Roadmap[];
  /**
   * 該 repo 全部 open + closed issues（不限 roadmap）
   * 排除 PR 與 SENSITIVE_LABELS 的 issue，依 updatedAt desc 排序
   * - 與 roadmaps[].issues 可能有重疊（同一 issue 若有 roadmap 會兩邊都出現）
   * - 消費端（RepoIssueList）獨立呈現，不與 roadmap 視圖混用
   */
  allIssues: IssueLite[];
}

// ===========================================================================
// Phase 2 — runtime API endpoints
// ===========================================================================

/**
 * `GET /api/health/github` response。
 * 讓 admin / 監控確認後端是否有足夠 GitHub API quota、PAT 是否仍然可用。
 */
export interface GithubHealthStatus {
  /** PAT 是否可用（能呼叫 octokit.rateLimit.get 且回 200）*/
  ok: boolean;
  /** rate limit 剩餘，ok=false 時可為 null */
  remaining: number | null;
  /** rate limit 上限 */
  limit: number | null;
  /** rate limit reset time，ISO 8601；ok=false 時可為 null */
  resetAt: string | null;
  /** 問題訊息（ok=true 時為 null） */
  message: string | null;
}

/**
 * `POST /api/admin/refresh-data` response。
 * 告訴 UI 哪些 cache key 被清除，以及下次 read 會重新觸發 GitHub fetch。
 */
export interface RefreshDataResult {
  /** 清除的 cache key 數 */
  clearedKeys: number;
  /** ISO 8601，操作時間 */
  clearedAt: string;
}

/**
 * `GET /api/repos/:owner/:name/roadmaps/:number/issues` response（分頁）。
 * 為大型 roadmap 做的 fallback；小 roadmap 直接走 RepoDetail.roadmaps[].issues 即可。
 */
export interface RoadmapIssuesPage {
  items: IssueLite[];
  /** 當前頁碼（1-indexed）*/
  page: number;
  /** 每頁筆數 */
  perPage: number;
  /** 該 roadmap 的總 issue 數（已過濾） */
  total: number;
  /** 是否還有下一頁 */
  hasMore: boolean;
}

/**
 * 個人化釘選清單單筆（issue #16）。
 * Sidebar 預設只顯示自己釘選的 repo；user 自己 CRUD，不跨人共享。
 */
export interface PinnedRepoDTO {
  repoOwner: string;
  repoName: string;
  /** ISO 8601 */
  createdAt: string;
}

/** Phase 2 新 endpoints 統一的路徑常數（前後端共用，避免打錯字） */
export const API_PATHS = {
  summary: '/api/summary',
  repoDetail: (owner: string, name: string) =>
    `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/detail`,
  roadmapIssues: (owner: string, name: string, roadmapNumber: number) =>
    `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/roadmaps/${roadmapNumber}/issues`,
  adminRefresh: '/api/admin/refresh-data',
  githubHealth: '/api/health/github',
  /** issue #16：當前使用者的釘選清單 */
  myPinnedRepos: '/api/me/pinned-repos',
  myPinnedRepo: (owner: string, name: string) =>
    `/api/me/pinned-repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
} as const;
