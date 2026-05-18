/**
 * RepoPendingIssuesPanel（issue #30）
 *
 * RoadmapPage 第三個頁籤「待審查 Issues」的內容。
 *
 * 視角分流：
 *   - Admin：用 GET /api/admin/issues?status=pending 拿到全部 pending、
 *     在 client 過濾出當前 repo；每列附「前往審核」連結到
 *     #/admin?tab=issues 統一處理（避免重複 approve / reject UI）
 *   - 非 admin：用 GET /api/me/issues 拿自己提過的、client 端過濾此 repo
 *     且 status=pending；每列附「前往撤銷」連結到 #/me/issues
 *
 * 不在這裡內嵌 approve / reject / 撤銷的 mutation 邏輯：那些操作都已在
 * AdminPage 與 MyIssuesPage 實作好，這個 panel 只當「快速一覽 +
 * 跳轉入口」用，避免兩處重複維護同一份審核狀態。
 */

import { ExternalLink, Inbox, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminIssueRow, SubmittedIssueDTO } from 'shared';
import EmptyState from './EmptyState';
import IssueStatusBadge from './IssueStatusBadge';
import { ApiError, fetchAdminIssues, fetchMyIssues } from '../data/api';
import { formatTimeAgo } from '../utils/date';

type TPanelProps = {
  repoOwner: string;
  repoName: string;
  isAdmin: boolean;
};

type TFetchState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; rows: T[] };

const RepoPendingIssuesPanel = ({ repoOwner, repoName, isAdmin }: TPanelProps) => {
  if (isAdmin) {
    return <AdminPendingList repoOwner={repoOwner} repoName={repoName} />;
  }
  return <MyPendingList repoOwner={repoOwner} repoName={repoName} />;
};

const AdminPendingList = ({ repoOwner, repoName }: { repoOwner: string; repoName: string }) => {
  const [state, setState] = useState<TFetchState<AdminIssueRow>>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    fetchAdminIssues('pending')
      .then((rows) => {
        if (cancelled) return;
        const filtered = rows.filter(
          (r) => r.repoOwner === repoOwner && r.repoName === repoName,
        );
        setState({ status: 'ok', rows: filtered });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof ApiError ? err.message : '讀取待審 issue 失敗';
        setState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [repoOwner, repoName]);

  if (state.status === 'loading') return <LoadingStub />;
  if (state.status === 'error') return <ErrorStub message={state.message} />;
  if (state.rows.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="目前沒有待審查的 issue"
        description="此 repo 沒有任何 status=pending 的投稿。新投稿一進來就會顯示在這。"
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-[--color-text-muted]">
        共 {state.rows.length} 筆 — 點「前往審核」到 admin 後台統一處理
      </p>
      <ul className="flex flex-col divide-y divide-[--color-border] overflow-hidden rounded-xl border border-[--color-border] bg-white">
        {state.rows.map((row) => (
          <li key={row.id} className="flex flex-col gap-1 p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-[--color-text-primary]">
                {row.title}
              </span>
              <IssueStatusBadge status={row.status} />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[--color-text-muted]">
              <span>{row.author.displayName}</span>
              <span>·</span>
              <span>{row.author.email}</span>
              <span>·</span>
              <time dateTime={row.createdAt}>{formatTimeAgo(row.createdAt)}</time>
              {row.bodyPreview && (
                <span className="line-clamp-1 text-[--color-text-secondary]">
                  · {row.bodyPreview}
                </span>
              )}
            </div>
            <div className="mt-1">
              <Link
                to="/admin?tab=issues"
                className="inline-flex items-center gap-1 text-xs font-medium text-[--color-brand] hover:underline"
              >
                前往審核
                <ExternalLink size={12} strokeWidth={2.25} />
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

const MyPendingList = ({ repoOwner, repoName }: { repoOwner: string; repoName: string }) => {
  const [state, setState] = useState<TFetchState<SubmittedIssueDTO>>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    fetchMyIssues()
      .then((rows) => {
        if (cancelled) return;
        const filtered = rows.filter(
          (r) =>
            r.repoOwner === repoOwner &&
            r.repoName === repoName &&
            r.status === 'pending',
        );
        setState({ status: 'ok', rows: filtered });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : '讀取我的 issue 失敗';
        setState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [repoOwner, repoName]);

  if (state.status === 'loading') return <LoadingStub />;
  if (state.status === 'error') return <ErrorStub message={state.message} />;
  if (state.rows.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="你在此 repo 沒有待審查的 issue"
        description="待審查清單只顯示你自己投稿、且尚未被審核的 issue。所有審核都由管理員處理。"
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-[--color-text-muted]">
        共 {state.rows.length} 筆你的投稿正在等待管理員審核
      </p>
      <ul className="flex flex-col divide-y divide-[--color-border] overflow-hidden rounded-xl border border-[--color-border] bg-white">
        {state.rows.map((row) => (
          <li key={row.id} className="flex flex-col gap-1 p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-[--color-text-primary]">
                {row.title}
              </span>
              <IssueStatusBadge status={row.status} />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[--color-text-muted]">
              <time dateTime={row.createdAt}>送出於 {formatTimeAgo(row.createdAt)}</time>
            </div>
            <div className="mt-1">
              <Link
                to="/me/issues"
                className="inline-flex items-center gap-1 text-xs font-medium text-[--color-brand] hover:underline"
              >
                前往「我的 Issue」管理
                <ExternalLink size={12} strokeWidth={2.25} />
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

const LoadingStub = () => (
  <div className="flex items-center gap-2 px-4 py-6 text-sm text-[--color-text-muted]">
    <Loader2 size={14} strokeWidth={2} className="animate-spin" />
    讀取中…
  </div>
);

const ErrorStub = ({ message }: { message: string }) => (
  <div className="card p-4 text-sm text-[--color-error]">{message}</div>
);

export default RepoPendingIssuesPanel;
