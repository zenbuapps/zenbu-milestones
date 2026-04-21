import {
  AlertOctagon,
  ArrowLeft,
  ExternalLink,
  EyeOff,
  FilePlus2,
  Inbox,
  Lock,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import type { TAppShellContext } from '../AppShell';
import EmptyState from '../components/EmptyState';
import IssueSubmitDialog from '../components/IssueSubmitDialog';
import IssueSubmitForm from '../components/IssueSubmitForm';
import LoadingSpinner from '../components/LoadingSpinner';
import MilestoneTimeline from '../components/MilestoneTimeline';
import PageHeader from '../components/PageHeader';
import RepoIssueList from '../components/RepoIssueList';
import RequireAuthGate from '../components/RequireAuthGate';
import { ApiError, fetchRepoDetail } from '../data/api';
import type { RepoDetail } from 'shared';
import { formatDate } from '../utils/date';

// TODO(M6)：repoOwner 目前固定 'zenbuapps'；fetcher 尚未抓多 org 資料，
// types.ts 的 RepoDetail 也沒有 owner 欄位。當未來真正支援跨 org 時，
// 需同步：scripts/fetch-data.ts 產出 owner、types.ts 新增 owner、此處改讀 detail.owner。
const DEFAULT_REPO_OWNER = 'zenbuapps';

/**
 * 單一 repo 的 Roadmap 頁
 * 上方資訊列 + Milestone 時間軸 + 登入後可提出 Issue
 *
 * 「提出 Issue」按鈕顯示策略：
 * - authenticated：顯示主要 CTA 按鈕，點擊打開 Dialog
 * - 其他狀態（loading / unauthenticated / unavailable）：隱藏按鈕，
 *   避免未登入使用者在點擊後才被引導登入（會打斷流程）。登入入口統一由
 *   TopNav 的 UserMenu 提供，保持心智模型一致。
 */
const RoadmapPage = () => {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { session, hiddenRepos, nonSubmittableRepos } = useOutletContext<TAppShellContext>();
  const isAdmin = session.state.status === 'authenticated' && session.state.user.role === 'admin';
  const isHidden = name ? hiddenRepos.has(name) : false;
  const isNonSubmittable = name ? nonSubmittableRepos.has(name) : false;

  const [detail, setDetail] = useState<RepoDetail | null>(null);
  const [error, setError] = useState<Error | null>(null);
  /** 後端明確告知需要登入（HTTP 401）；與一般錯誤分流 */
  const [needsAuth, setNeedsAuth] = useState<boolean>(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isFormDirty, setIsFormDirty] = useState(false);

  const sessionStatus = session.state.status;

  useEffect(() => {
    if (!name) {
      setError(new Error('缺少 repo 名稱參數'));
      return;
    }
    // Session 尚在 loading 時先等一下再打，避免先打一次 401 閃個 gate 又覆蓋
    if (sessionStatus === 'loading') {
      return;
    }
    // 明確未登入：直接掛 gate，不打 API（同 AppShell 策略）
    if (sessionStatus === 'unauthenticated') {
      setDetail(null);
      setError(null);
      setNeedsAuth(true);
      return;
    }

    let cancelled = false;
    setDetail(null);
    setError(null);
    setNeedsAuth(false);
    fetchRepoDetail(DEFAULT_REPO_OWNER, name)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.httpStatus === 401) {
          setNeedsAuth(true);
          return;
        }
        setError(err instanceof Error ? err : new Error(String(err)));
      });
    return () => {
      cancelled = true;
    };
  }, [name, sessionStatus]);

  if (needsAuth) {
    return <RequireAuthGate onLogin={session.login} />;
  }

  if (error) {
    return (
      <>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="btn-ghost mb-4 -ml-3"
        >
          <ArrowLeft size={15} strokeWidth={2} /> 返回總覽
        </button>
        <EmptyState
          icon={AlertOctagon}
          title="載入 repo 資料失敗"
          description={error.message}
        />
      </>
    );
  }

  if (!detail) {
    return (
      <div className="flex h-64 items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // Hidden repo 對非 admin 一律隱藏（即使深連結也擋掉）；admin 仍可瀏覽
  if (isHidden && !isAdmin) {
    return (
      <>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="btn-ghost mb-4 -ml-3"
        >
          <ArrowLeft size={15} strokeWidth={2} /> 返回總覽
        </button>
        <EmptyState
          icon={EyeOff}
          title="此 repo 目前不對外公開"
          description="管理員尚未開放此 repo 的瀏覽，請稍後再試或聯絡管理員"
        />
      </>
    );
  }

  const total = detail.milestones.length;
  const closed = detail.milestones.filter((m) => m.state === 'closed').length;
  const completionPct = total === 0 ? 0 : Math.round((closed / total) * 100);
  const isLoggedIn = session.state.status === 'authenticated';
  const canSubmitIssue = isLoggedIn && !isNonSubmittable;

  return (
    <>
      <button
        type="button"
        onClick={() => navigate('/')}
        className="btn-ghost mb-4 -ml-3"
      >
        <ArrowLeft size={15} strokeWidth={2} /> 返回總覽
      </button>

      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            {detail.name}
            {detail.isPrivate && (
              <Lock size={14} strokeWidth={2} className="text-[--color-text-muted]" />
            )}
          </span>
        }
        description={detail.description ?? undefined}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {isLoggedIn && (
              isNonSubmittable ? (
                <button
                  type="button"
                  disabled
                  className="btn-primary cursor-not-allowed opacity-50"
                  title="管理員已關閉此 repo 的外部投稿"
                >
                  <FilePlus2 size={15} strokeWidth={2} />
                  此 repo 暫不接受投稿
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsDialogOpen(true)}
                  className="btn-primary"
                >
                  <FilePlus2 size={15} strokeWidth={2} />
                  提出 Issue
                </button>
              )
            )}
            <a
              href={detail.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary"
            >
              <ExternalLink size={15} strokeWidth={2} />
              開啟 GitHub Repo
            </a>
          </div>
        }
      />

      {isHidden && isAdmin && (
        <div className="card mb-4 flex items-start gap-3 border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <EyeOff size={16} strokeWidth={2} className="mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">此 repo 已被你（管理員）設為「不顯示於 UI」</p>
            <p className="mt-0.5 text-xs">一般訪客現在無法看到此頁；你看得到是因為你是 admin。在 #/admin?tab=repos 切回 visible。</p>
          </div>
        </div>
      )}

      {/* 資訊列 */}
      <div className="card mb-6 grid grid-cols-2 gap-3 p-4 sm:gap-4 sm:p-5 md:grid-cols-4">
        <InfoCell label="語言" value={detail.language ?? '—'} />
        <InfoCell label="最後更新" value={formatDate(detail.updatedAt)} />
        <InfoCell label="總 Milestones" value={String(total)} />
        <InfoCell label="完成率" value={`${completionPct}%`} />
      </div>

      {total === 0 ? (
        <EmptyState
          icon={Inbox}
          title="此 repo 尚未建立任何 milestone"
          description="在 GitHub 上為 repo 建立 milestone 後，會自動出現在這裡。"
        />
      ) : (
        <MilestoneTimeline milestones={detail.milestones} />
      )}

      {detail.allIssues.length > 0 && <RepoIssueList detail={detail} />}

      {/* Issue 提交對話框：只在有 repo name 且已登入時 mount，避免干擾 hook 順序 */}
      {canSubmitIssue && name && (
        <IssueSubmitDialog
          open={isDialogOpen}
          onClose={() => {
            setIsDialogOpen(false);
            setIsFormDirty(false);
          }}
          hasUnsavedChanges={isFormDirty}
          repoName={name}
        >
          <IssueSubmitForm
            repoOwner={DEFAULT_REPO_OWNER}
            repoName={name}
            onSuccess={() => {
              setIsDialogOpen(false);
              setIsFormDirty(false);
            }}
            onDirtyChange={setIsFormDirty}
            onRequestLogin={session.login}
          />
        </IssueSubmitDialog>
      )}
    </>
  );
};

type TInfoCellProps = {
  label: string;
  value: string;
};

/**
 * 資訊列單格（內部輔助元件）
 */
const InfoCell = ({ label, value }: TInfoCellProps) => (
  <div className="flex flex-col">
    <span className="text-xs font-medium text-[--color-text-muted]">{label}</span>
    <span className="mt-0.5 text-sm font-semibold text-[--color-text-primary]">{value}</span>
  </div>
);

export default RoadmapPage;
