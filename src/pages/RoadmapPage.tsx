import {
  AlertOctagon,
  ArrowLeft,
  ExternalLink,
  Inbox,
  Lock,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import EmptyState from '../components/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner';
import MilestoneTimeline from '../components/MilestoneTimeline';
import PageHeader from '../components/PageHeader';
import { loadRepoDetail } from '../data/loader';
import type { RepoDetail } from '../data/types';
import { formatDate } from '../utils/date';

/**
 * 單一 repo 的 Roadmap 頁
 * 上方資訊列 + Milestone 時間軸
 */
const RoadmapPage = () => {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<RepoDetail | null>(null);
  const [error, setError] = useState<Error | null>(null);

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
          <a
            href={detail.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
          >
            <ExternalLink size={15} strokeWidth={2} />
            開啟 GitHub Repo
          </a>
        }
      />

      {/* 資訊列 */}
      <div className="card mb-6 grid grid-cols-2 gap-4 p-5 md:grid-cols-4">
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
