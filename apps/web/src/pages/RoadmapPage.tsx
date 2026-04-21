import {
  AlertOctagon,
  ArrowLeft,
  ExternalLink,
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
import { loadRepoDetail } from '../data/loader';
import type { RepoDetail } from '../data/types';
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
  const { session } = useOutletContext<TAppShellContext>();

  const [detail, setDetail] = useState<RepoDetail | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isFormDirty, setIsFormDirty] = useState(false);

  useEffect(() => {
    if (!name) {
      setError(new Error('缺少 repo 名稱參數'));
      return;
    }
    let cancelled = false;
    setDetail(null);
    setError(null);
    loadRepoDetail(name)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [name]);

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

  const total = detail.milestones.length;
  const closed = detail.milestones.filter((m) => m.state === 'closed').length;
  const completionPct = total === 0 ? 0 : Math.round((closed / total) * 100);
  const canSubmitIssue = session.state.status === 'authenticated';

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
            {canSubmitIssue && (
              <button
                type="button"
                onClick={() => setIsDialogOpen(true)}
                className="btn-primary"
              >
                <FilePlus2 size={15} strokeWidth={2} />
                提出 Issue
              </button>
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
