import { AlertOctagon, ExternalLink, FileText, LogIn, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import type { SubmittedIssueDTO } from 'shared';
import type { TAppShellContext } from '../AppShell';
import EmptyState from '../components/EmptyState';
import IssueStatusBadge from '../components/IssueStatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import PageHeader from '../components/PageHeader';
import { ApiError, fetchMyIssues } from '../data/api';
import { formatTimeAgo } from '../utils/date';

/**
 * 我的 issue 管理頁（路徑：#/me/issues）
 * ---------------------------------------------------------------
 * - 未登入：顯示引導登入
 * - 登入但查詢失敗：錯誤區塊 + 重試
 * - 已登入且有資料：依狀態分組顯示（pending / approved / rejected / synced）
 *
 * 查 `GET /api/me/issues`，後端已依 createdAt desc 排序，不需前端再排。
 */
type TFetchState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ok'; issues: SubmittedIssueDTO[] };

const MyIssuesPage = () => {
  const { session } = useOutletContext<TAppShellContext>();
  const [state, setState] = useState<TFetchState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    // session 還在 loading / unavailable / unauthenticated 時不打後端
    if (session.state.status !== 'authenticated') {
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    fetchMyIssues()
      .then((issues) => {
        if (!cancelled) setState({ status: 'ok', issues });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof ApiError
            ? err.httpStatus === 401
              ? '登入已失效，請重新登入'
              : err.message
            : '讀取失敗，請稍後重試';
        setState({ status: 'error', error: message });
      });

    return () => {
      cancelled = true;
    };
  }, [session.state.status, reloadKey]);

  // 統計資訊（給 header subtitle 用）
  const summary = useMemo(() => {
    if (state.status !== 'ok') return null;
    const counts = {
      total: state.issues.length,
      pending: 0,
      approved: 0,
      rejected: 0,
      synced: 0,
    };
    for (const i of state.issues) {
      if (i.status === 'pending') counts.pending += 1;
      else if (i.status === 'approved') counts.approved += 1;
      else if (i.status === 'rejected') counts.rejected += 1;
      else if (i.status === 'synced-to-github') counts.synced += 1;
    }
    return counts;
  }, [state]);

  // ------------------- 未登入 -------------------
  if (session.state.status === 'loading') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (session.state.status === 'unavailable') {
    return (
      <EmptyState
        icon={AlertOctagon}
        title="後端服務未配置"
        description="VITE_API_BASE_URL 未設定，無法讀取 issue 列表"
      />
    );
  }

  if (session.state.status === 'unauthenticated') {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <EmptyState
          icon={LogIn}
          title="需要登入"
          description="此頁僅顯示你自己送出的 issue 草稿，請先以 Google 登入"
        />
        <button type="button" onClick={session.login} className="btn-primary">
          <LogIn size={16} strokeWidth={2} />
          以 Google 登入
        </button>
      </div>
    );
  }

  // ------------------- 已登入：loading / error / ok -------------------
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="我的 Issue"
        description={
          summary
            ? `共 ${summary.total} 筆：待審 ${summary.pending}・已通過 ${summary.approved}・已拒絕 ${summary.rejected}・已轉 GitHub ${summary.synced}`
            : '你在各 repo 提交過的 issue 草稿與審核狀態'
        }
        action={
          <button
            type="button"
            onClick={refresh}
            className="btn-ghost"
            aria-label="重新整理"
            disabled={state.status === 'loading'}
          >
            <RefreshCw size={14} strokeWidth={2} className={state.status === 'loading' ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">重新整理</span>
          </button>
        }
      />

      {state.status === 'loading' && (
        <div className="flex min-h-[30vh] items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {state.status === 'error' && (
        <div className="card flex items-start gap-3 p-4 text-sm text-[--color-error]">
          <AlertOctagon size={18} strokeWidth={2} className="mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium">讀取失敗</p>
            <p className="mt-1 text-xs text-[--color-text-muted]">{state.error}</p>
          </div>
          <button type="button" onClick={refresh} className="btn-secondary">
            重試
          </button>
        </div>
      )}

      {state.status === 'ok' && state.issues.length === 0 && (
        <EmptyState
          icon={FileText}
          title="還沒提交過 issue"
          description="到任一 repo 的 roadmap 頁點「提出 Issue」就能開始提交"
        />
      )}

      {state.status === 'ok' && state.issues.length > 0 && (
        <ul className="flex flex-col gap-2">
          {state.issues.map((issue) => (
            <IssueRow key={issue.id} issue={issue} />
          ))}
        </ul>
      )}
    </div>
  );
};

/**
 * 單列顯示：標題 + repo + 狀態 + 時間 + 連結
 * - 已同步 GitHub：顯示 GitHub URL 外連
 * - 已拒絕：顯示拒絕原因（rejectReason）
 */
const IssueRow = ({ issue }: { issue: SubmittedIssueDTO }) => {
  const repoSlug = `${issue.repoOwner}/${issue.repoName}`;
  const repoHashLink = `/repo/${issue.repoName}`;
  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-[--color-text-primary]">{issue.title}</h3>
            <IssueStatusBadge status={issue.status} />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[--color-text-muted]">
            <Link to={repoHashLink} className="hover:text-[--color-brand] hover:underline">
              {repoSlug}
            </Link>
            <span>·</span>
            <time dateTime={issue.createdAt}>{formatTimeAgo(issue.createdAt)}</time>
            {issue.githubIssueNumber !== null && (
              <>
                <span>·</span>
                <span>#{issue.githubIssueNumber}</span>
              </>
            )}
          </div>
          {issue.status === 'rejected' && issue.rejectReason && (
            <p className="mt-1 rounded-md bg-red-50 p-2 text-xs text-red-700">
              <span className="font-semibold">拒絕原因：</span>
              {issue.rejectReason}
            </p>
          )}
        </div>

        {issue.githubIssueUrl && (
          <a
            href={issue.githubIssueUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost flex-shrink-0"
            aria-label="開啟 GitHub issue"
          >
            <ExternalLink size={14} strokeWidth={2} />
            <span className="hidden sm:inline">GitHub</span>
          </a>
        )}
      </div>
    </li>
  );
};

export default MyIssuesPage;
