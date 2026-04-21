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

/** 稽核 log 單筆 */
export interface AuditLogRow {
  id: string;
  action: string; // 'role.grant' | 'role.revoke' | 'repo.update' | 'issue.approve' | 'issue.reject'
  actor: { id: string; email: string; displayName: string };
  targetType: string;
  targetId: string;
  payload: unknown;
  createdAt: string;
}
