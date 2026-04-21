/**
 * IssueReviewTable
 * ---------------------------------------------------------------
 * 管理員審核頁的主表格，依 status 過濾列出 issue 草稿。
 *
 * 狀態流（plan.md §M4）：
 *   pending      → 有「通過 / 拒絕」按鈕
 *   approved     → DB 已標 approved 但 GitHub 同步失敗，標「未同步」
 *   rejected     → 顯示 rejectReason（hover 看全文）
 *   synced-to-github → 顯示 #N + 外連至 GitHub
 *
 * 通過流程：
 *   confirm → POST approve
 *     ├─ success=true → toast「已通過並同步 #N」+ 列表就地更新
 *     └─ success=false → toast warning「DB 已標 approved，GitHub 同步失敗：{error.message}」+ 更新為 approved
 *
 * 拒絕流程：
 *   RejectReasonDialog → POST reject → 成功 toast + 列表更新
 *
 * Table 樣式決策（zenbuapps-design-system/references/forms-and-data.md）：
 * - 桌機：`<table>` 結構 + `.card` 外殼包裹（border + rounded + bg-white）
 * - 手機：窄螢幕改用 stacked card 呈現（不水平捲動，閱讀性更好）
 * - 列 hover 用 `hover:bg-[--color-surface-overlay]`，符合設計系統清單樣式
 */

import {
  AlertTriangle,
  Check,
  ExternalLink,
  FileText,
  Inbox,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdminIssueRow, IssueStatus } from 'shared';
import {
  ApiError,
  approveAdminIssue,
  fetchAdminIssues,
  rejectAdminIssue,
  type AdminIssueStatusFilter,
} from '../../data/api';
import { formatTimeAgo } from '../../utils/date';
import EmptyState from '../EmptyState';
import IssueStatusBadge from '../IssueStatusBadge';
import LoadingSpinner from '../LoadingSpinner';
import { useToast } from '../Toast/useToast';
import RejectReasonDialog from './RejectReasonDialog';

/** status filter 的 tab 清單；順序為使用頻率由高到低 */
const STATUS_TABS: Array<{ value: AdminIssueStatusFilter; label: string }> = [
  { value: 'pending', label: '待審核' },
  { value: 'synced-to-github', label: '已轉 GitHub' },
  { value: 'approved', label: '已通過（未同步）' },
  { value: 'rejected', label: '已拒絕' },
  { value: 'all', label: '全部' },
];

type TFetchState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; issues: AdminIssueRow[] };

const IssueReviewTable = () => {
  const [filter, setFilter] = useState<AdminIssueStatusFilter>('pending');
  const [state, setState] = useState<TFetchState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const { showToast } = useToast();

  // 展開看 body preview 的 row id
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 拒絕對話框目標
  const [rejectTarget, setRejectTarget] = useState<AdminIssueRow | null>(null);

  // 通過處理中的 id（避免重複點擊）
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    fetchAdminIssues(filter)
      .then((issues) => {
        if (!cancelled) setState({ status: 'ok', issues });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : '讀取失敗，請稍後重試';
        setState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [filter, reloadKey]);

  /** 就地用新 row 替換列表中對應 id 的項目 */
  const patchRow = useCallback((row: AdminIssueRow) => {
    setState((prev) => {
      if (prev.status !== 'ok') return prev;
      return {
        status: 'ok',
        issues: prev.issues.map((i) => (i.id === row.id ? row : i)),
      };
    });
  }, []);

  const handleApprove = useCallback(
    async (issue: AdminIssueRow) => {
      if (!window.confirm(`確定通過此 issue？\n\n${issue.title}\n\n通過後會立即由後端代轉到 GitHub。`)) {
        return;
      }
      setApprovingId(issue.id);
      try {
        const result = await approveAdminIssue(issue.id);
        patchRow(result.data);

        if (result.error === null) {
          // 完全成功：已標 synced-to-github
          const ghNum = result.data.githubIssueNumber;
          const ghUrl = result.data.githubIssueUrl;
          showToast({
            type: 'success',
            message: ghNum !== null ? `已通過並同步 GitHub #${ghNum}` : '已通過並同步 GitHub',
            linkText: ghUrl ? '查看 GitHub issue' : undefined,
            linkUrl: ghUrl ?? undefined,
          });
        } else {
          // DB 已 approved 但 GitHub 失敗
          showToast({
            type: 'error',
            message: `已標為 approved，但 GitHub 同步失敗：${result.error.message}`,
            durationMs: 8000,
          });
        }
      } catch (err) {
        const msg =
          err instanceof ApiError ? err.message : err instanceof Error ? err.message : '通過失敗';
        showToast({ type: 'error', message: `通過失敗：${msg}` });
      } finally {
        setApprovingId(null);
      }
    },
    [patchRow, showToast],
  );

  const handleRejectSubmit = useCallback(
    async (reason: string): Promise<void> => {
      if (!rejectTarget) return;
      const row = await rejectAdminIssue(rejectTarget.id, reason);
      patchRow(row);
      showToast({ type: 'success', message: `已拒絕「${rejectTarget.title}」` });
      setRejectTarget(null);
    },
    [patchRow, rejectTarget, showToast],
  );

  // 給 filter tab 顯示 badge 用（pending / approved 的數字會影響 admin 注意力）
  const counts = useMemo(() => {
    if (state.status !== 'ok') return null;
    const byStatus: Record<IssueStatus, number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
      'synced-to-github': 0,
    };
    for (const i of state.issues) byStatus[i.status] += 1;
    return byStatus;
  }, [state]);

  return (
    <div className="flex flex-col gap-4">
      {/* Filter tabs + 重新整理 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className="flex flex-wrap items-center gap-1 rounded-lg border border-[--color-border] bg-white p-1"
          role="tablist"
          aria-label="依狀態過濾"
        >
          {STATUS_TABS.map((tab) => {
            const active = filter === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(tab.value)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-[--color-brand] text-white'
                    : 'text-[--color-text-secondary] hover:bg-[--color-surface-overlay]'
                }`}
              >
                {tab.label}
                {counts && tab.value !== 'all' && counts[tab.value] > 0 && (
                  <span
                    className={`ml-1.5 inline-flex min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] ${
                      active
                        ? 'bg-white/25 text-white'
                        : 'bg-[--color-surface-overlay] text-[--color-text-muted]'
                    }`}
                  >
                    {counts[tab.value]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={refresh}
          className="btn-ghost"
          disabled={state.status === 'loading'}
          aria-label="重新整理"
        >
          <RefreshCw
            size={14}
            strokeWidth={2}
            className={state.status === 'loading' ? 'animate-spin' : ''}
          />
          <span className="hidden sm:inline">重新整理</span>
        </button>
      </div>

      {state.status === 'loading' && (
        <div className="flex min-h-[30vh] items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {state.status === 'error' && (
        <div className="card flex items-start gap-3 p-4 text-sm">
          <AlertTriangle
            size={18}
            strokeWidth={2}
            className="mt-0.5 flex-shrink-0 text-[--color-error]"
          />
          <div className="flex-1">
            <p className="font-medium text-[--color-error]">讀取失敗</p>
            <p className="mt-1 text-xs text-[--color-text-muted]">{state.message}</p>
          </div>
          <button type="button" onClick={refresh} className="btn-secondary">
            重試
          </button>
        </div>
      )}

      {state.status === 'ok' && state.issues.length === 0 && (
        <EmptyState
          icon={Inbox}
          title="目前沒有符合條件的 issue"
          description={filter === 'pending' ? '所有待審核都處理完了，辛苦了' : '可切換其他狀態查看'}
        />
      )}

      {state.status === 'ok' && state.issues.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-[--color-border] bg-white">
          {/* 桌機版 table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="bg-[--color-surface-overlay] text-left text-xs uppercase tracking-wide text-[--color-text-muted]">
                <tr>
                  <th className="px-4 py-3 font-medium">作者</th>
                  <th className="px-4 py-3 font-medium">標題</th>
                  <th className="px-4 py-3 font-medium">Repo</th>
                  <th className="px-4 py-3 font-medium">狀態</th>
                  <th className="px-4 py-3 font-medium">建立</th>
                  <th className="px-4 py-3 text-right font-medium">動作</th>
                </tr>
              </thead>
              <tbody>
                {state.issues.map((issue) => (
                  <IssueRow
                    key={issue.id}
                    issue={issue}
                    expanded={expandedId === issue.id}
                    onToggleExpand={() =>
                      setExpandedId((prev) => (prev === issue.id ? null : issue.id))
                    }
                    approving={approvingId === issue.id}
                    onApprove={() => handleApprove(issue)}
                    onRequestReject={() => setRejectTarget(issue)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* 手機版 stacked card */}
          <div className="flex flex-col divide-y divide-[--color-border] md:hidden">
            {state.issues.map((issue) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                expanded={expandedId === issue.id}
                onToggleExpand={() =>
                  setExpandedId((prev) => (prev === issue.id ? null : issue.id))
                }
                approving={approvingId === issue.id}
                onApprove={() => handleApprove(issue)}
                onRequestReject={() => setRejectTarget(issue)}
              />
            ))}
          </div>
        </div>
      )}

      <RejectReasonDialog
        open={rejectTarget !== null}
        issueTitle={rejectTarget?.title ?? ''}
        onClose={() => setRejectTarget(null)}
        onSubmit={handleRejectSubmit}
      />
    </div>
  );
};

// ===========================================================================
// 子元件：桌機 table row / 手機 stacked card
// ===========================================================================

type TIssueRowProps = {
  issue: AdminIssueRow;
  expanded: boolean;
  onToggleExpand: () => void;
  approving: boolean;
  onApprove: () => void;
  onRequestReject: () => void;
};

/** 桌機 table row —— 點標題展開看 body preview */
const IssueRow = ({
  issue,
  expanded,
  onToggleExpand,
  approving,
  onApprove,
  onRequestReject,
}: TIssueRowProps) => (
  <>
    <tr className="border-t border-[--color-border] hover:bg-[--color-surface-overlay]">
      <td className="px-4 py-3 align-top">
        <AuthorCell author={issue.author} />
      </td>
      <td className="px-4 py-3 align-top">
        <button
          type="button"
          onClick={onToggleExpand}
          className="text-left text-sm font-medium text-[--color-text-primary] hover:text-[--color-brand]"
          aria-expanded={expanded}
        >
          {issue.title}
        </button>
      </td>
      <td className="px-4 py-3 align-top text-xs">
        <RepoLink owner={issue.repoOwner} name={issue.repoName} />
      </td>
      <td className="px-4 py-3 align-top">
        <IssueStatusBadge status={issue.status} />
      </td>
      <td className="px-4 py-3 align-top text-xs text-[--color-text-muted]">
        <time dateTime={issue.createdAt}>{formatTimeAgo(issue.createdAt)}</time>
      </td>
      <td className="px-4 py-3 align-top">
        <div className="flex items-center justify-end gap-1.5">
          <ActionCluster
            issue={issue}
            approving={approving}
            onApprove={onApprove}
            onRequestReject={onRequestReject}
          />
        </div>
      </td>
    </tr>
    {expanded && (
      <tr className="bg-[--color-surface]">
        <td colSpan={6} className="px-4 py-3">
          <BodyPreview issue={issue} />
        </td>
      </tr>
    )}
  </>
);

/** 手機 stacked card —— 同一 row 折疊 */
const IssueCard = ({
  issue,
  expanded,
  onToggleExpand,
  approving,
  onApprove,
  onRequestReject,
}: TIssueRowProps) => (
  <div className="flex flex-col gap-2 p-4">
    <div className="flex items-start justify-between gap-2">
      <AuthorCell author={issue.author} />
      <IssueStatusBadge status={issue.status} />
    </div>
    <button
      type="button"
      onClick={onToggleExpand}
      className="text-left text-sm font-medium text-[--color-text-primary] hover:text-[--color-brand]"
      aria-expanded={expanded}
    >
      {issue.title}
    </button>
    <div className="flex flex-wrap items-center gap-2 text-xs text-[--color-text-muted]">
      <RepoLink owner={issue.repoOwner} name={issue.repoName} />
      <span>·</span>
      <time dateTime={issue.createdAt}>{formatTimeAgo(issue.createdAt)}</time>
    </div>
    {expanded && <BodyPreview issue={issue} />}
    <div className="mt-1 flex items-center justify-end gap-1.5">
      <ActionCluster
        issue={issue}
        approving={approving}
        onApprove={onApprove}
        onRequestReject={onRequestReject}
      />
    </div>
  </div>
);

// ===========================================================================
// 細節子元件
// ===========================================================================

const AuthorCell = ({ author }: { author: AdminIssueRow['author'] }) => (
  <div className="flex items-start gap-2">
    {author.avatarUrl ? (
      <img
        src={author.avatarUrl}
        alt={author.displayName}
        className="h-7 w-7 flex-shrink-0 rounded-full border border-[--color-border]"
        referrerPolicy="no-referrer"
      />
    ) : (
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[--color-surface-overlay] text-[11px] font-semibold text-[--color-text-muted]">
        {author.displayName.slice(0, 1).toUpperCase()}
      </div>
    )}
    <div className="flex min-w-0 flex-col leading-tight">
      <span className="truncate text-xs font-medium text-[--color-text-primary]">
        {author.displayName}
      </span>
      <span className="truncate text-[11px] text-[--color-text-muted]">{author.email}</span>
    </div>
  </div>
);

const RepoLink = ({ owner, name }: { owner: string; name: string }) => (
  <a
    href={`/#/repo/${encodeURIComponent(name)}`}
    className="text-[--color-text-muted] hover:text-[--color-brand] hover:underline"
    title={`${owner}/${name}`}
  >
    {owner}/{name}
  </a>
);

const BodyPreview = ({ issue }: { issue: AdminIssueRow }) => (
  <div className="flex flex-col gap-2 rounded-md border border-[--color-border] bg-white p-3 text-xs text-[--color-text-secondary]">
    <div className="flex items-center gap-1.5 text-[--color-text-muted]">
      <FileText size={12} strokeWidth={2.25} />
      <span className="font-medium">預覽（前 200 字）</span>
    </div>
    <p className="whitespace-pre-wrap break-words">{issue.bodyPreview || '（無內容）'}</p>
    {issue.status === 'rejected' && issue.rejectReason && (
      <div className="mt-1 rounded-md bg-red-50 p-2 text-xs text-red-700">
        <span className="font-semibold">拒絕原因：</span>
        {issue.rejectReason}
      </div>
    )}
  </div>
);

type TActionClusterProps = {
  issue: AdminIssueRow;
  approving: boolean;
  onApprove: () => void;
  onRequestReject: () => void;
};

const ActionCluster = ({ issue, approving, onApprove, onRequestReject }: TActionClusterProps) => {
  if (issue.status === 'pending') {
    return (
      <>
        <button
          type="button"
          onClick={onApprove}
          disabled={approving}
          className="btn-primary text-xs"
          aria-busy={approving}
          aria-label="通過"
        >
          {approving ? (
            <Loader2 size={12} strokeWidth={2.25} className="animate-spin" />
          ) : (
            <Check size={12} strokeWidth={2.25} />
          )}
          <span>通過</span>
        </button>
        <button
          type="button"
          onClick={onRequestReject}
          disabled={approving}
          className="btn-secondary text-xs"
          aria-label="拒絕"
        >
          <X size={12} strokeWidth={2.25} />
          <span>拒絕</span>
        </button>
      </>
    );
  }

  if (issue.status === 'synced-to-github' && issue.githubIssueUrl) {
    return (
      <a
        href={issue.githubIssueUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-ghost text-xs"
        aria-label="查看 GitHub issue"
      >
        <ExternalLink size={12} strokeWidth={2.25} />
        <span>#{issue.githubIssueNumber ?? ''}</span>
      </a>
    );
  }

  if (issue.status === 'approved') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700"
        title="DB 已標 approved，但 GitHub 同步失敗。後續版本會加入重試功能。"
      >
        <AlertTriangle size={12} strokeWidth={2.25} />
        未同步
      </span>
    );
  }

  if (issue.status === 'rejected') {
    return (
      <span className="text-xs italic text-[--color-text-muted]" title={issue.rejectReason ?? ''}>
        已拒絕
      </span>
    );
  }

  return null;
};

export default IssueReviewTable;
