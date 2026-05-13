import {
  AlertOctagon,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Loader2,
  LogIn,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import type { SubmittedIssueDTO } from 'shared';
import type { TAppShellContext } from '../AppShell';
import EmptyState from '../components/EmptyState';
import IssueStatusBadge from '../components/IssueStatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import MarkdownPreview from '../components/MarkdownPreview';
import PageHeader from '../components/PageHeader';
import { useToast } from '../components/Toast/useToast';
import { ApiError, fetchMyIssues, withdrawMyIssue } from '../data/api';
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
  const { showToast } = useToast();
  const [state, setState] = useState<TFetchState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  /** 撤銷中的 issue id；同時間只允許一個撤銷請求 in-flight，按鈕轉 spinner */
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  /**
   * 撤銷指定 issue。
   * - 使用者必須在 confirm 對話框按確認
   * - 成功：樂觀地從 state 把該列移除（不必重打 listMine）
   * - 失敗：依錯誤分類顯示 toast；status 已變動（409）時主動 refresh 拉新資料
   */
  const handleWithdraw = useCallback(
    async (issue: SubmittedIssueDTO) => {
      const ok = window.confirm(
        `確定要撤銷這則 issue 嗎？\n\n標題：${issue.title}\n\n撤銷後此筆會從清單移除，無法復原。`,
      );
      if (!ok) return;

      setWithdrawingId(issue.id);
      try {
        await withdrawMyIssue(issue.id);
        setState((prev) =>
          prev.status === 'ok'
            ? { status: 'ok', issues: prev.issues.filter((i) => i.id !== issue.id) }
            : prev,
        );
        showToast({ type: 'success', message: '已撤銷此 issue' });
      } catch (err: unknown) {
        if (err instanceof ApiError) {
          if (err.httpStatus === 409) {
            showToast({
              type: 'error',
              message: 'issue 狀態已變動（可能剛被審核），自動重新整理',
            });
            refresh();
          } else if (err.httpStatus === 403) {
            showToast({ type: 'error', message: '僅能撤銷自己提交的 issue' });
          } else if (err.httpStatus === 404) {
            showToast({ type: 'error', message: '找不到該 issue（可能已被移除）' });
            refresh();
          } else {
            showToast({ type: 'error', message: err.message || '撤銷失敗，請稍後重試' });
          }
        } else {
          showToast({ type: 'error', message: '撤銷失敗，請稍後重試' });
        }
      } finally {
        setWithdrawingId(null);
      }
    },
    [refresh, showToast],
  );

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
            <IssueRow
              key={issue.id}
              issue={issue}
              onWithdraw={handleWithdraw}
              isWithdrawing={withdrawingId === issue.id}
              disableWithdraw={withdrawingId !== null && withdrawingId !== issue.id}
            />
          ))}
        </ul>
      )}
    </div>
  );
};

type TIssueRowProps = {
  issue: SubmittedIssueDTO;
  /** 點下撤銷按鈕時呼叫；只在 status === 'pending' 時會傳入有意義行為 */
  onWithdraw: (issue: SubmittedIssueDTO) => void;
  /** 此列正在撤銷（顯示 spinner、停用按鈕） */
  isWithdrawing: boolean;
  /** 別列正在撤銷時 disable 本列按鈕，避免同時多請求 */
  disableWithdraw: boolean;
};

/**
 * 單列顯示：標題 + repo + 狀態 + 時間 + 連結 + 撤銷按鈕
 * - 已同步 GitHub：顯示 GitHub URL 外連
 * - 已拒絕：顯示拒絕原因（rejectReason）
 * - status === 'pending'：右側額外顯示「撤銷」按鈕（issue #6）
 * - bodyMarkdown 非空：可點「展開內容」展開 markdown 預覽（issue #13）
 */
const IssueRow = ({ issue, onWithdraw, isWithdrawing, disableWithdraw }: TIssueRowProps) => {
  const repoSlug = `${issue.repoOwner}/${issue.repoName}`;
  const repoHashLink = `/repo/${issue.repoName}`;
  const hasBody = issue.bodyMarkdown.trim() !== '';
  const [bodyExpanded, setBodyExpanded] = useState(false);
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

        <div className="flex flex-shrink-0 items-center gap-2">
          {issue.status === 'pending' && (
            <button
              type="button"
              onClick={() => onWithdraw(issue)}
              disabled={isWithdrawing || disableWithdraw}
              className="btn-ghost text-[--color-error] hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="撤銷此 issue"
              title="撤銷此 issue"
            >
              {isWithdrawing ? (
                <Loader2 size={14} strokeWidth={2} className="animate-spin" />
              ) : (
                <Trash2 size={14} strokeWidth={2} />
              )}
              <span className="hidden sm:inline">撤銷</span>
            </button>
          )}

          {issue.githubIssueUrl && (
            <a
              href={issue.githubIssueUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost"
              aria-label="開啟 GitHub issue"
            >
              <ExternalLink size={14} strokeWidth={2} />
              <span className="hidden sm:inline">GitHub</span>
            </a>
          )}
        </div>
      </div>

      {hasBody && (
        <div className="mt-3">
          {bodyExpanded && (
            <div className="rounded-md bg-[--color-surface] px-3 py-2 text-xs text-[--color-text-secondary]">
              <MarkdownPreview source={issue.bodyMarkdown} />
            </div>
          )}
          <button
            type="button"
            onClick={() => setBodyExpanded((v) => !v)}
            className={
              'inline-flex items-center gap-1 text-[11px] font-medium text-[--color-brand] hover:underline ' +
              (bodyExpanded ? 'mt-1.5' : '')
            }
            aria-expanded={bodyExpanded}
          >
            {bodyExpanded ? (
              <>
                <ChevronUp size={12} strokeWidth={2.25} />
                收合內容
              </>
            ) : (
              <>
                <ChevronDown size={12} strokeWidth={2.25} />
                展開內容
              </>
            )}
          </button>
        </div>
      )}
    </li>
  );
};

export default MyIssuesPage;
