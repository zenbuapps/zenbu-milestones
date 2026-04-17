import { AlertTriangle, ArrowRight, Clock, ExternalLink, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { RepoSummary } from '../data/types';
import { formatRelative } from '../utils/date';
import ProgressBar from './ProgressBar';

type TRepoCardProps = {
  repo: RepoSummary;
};

/**
 * Repository 卡片
 * 顯示語言、隱私、描述、milestone 完成率、下一個 milestone 與逾期警告
 */
const RepoCard = ({ repo }: TRepoCardProps) => {
  const completionPct = Math.round(repo.completionRate * 100);

  return (
    <div className="card flex flex-col gap-3 p-5 transition-shadow hover:shadow-md">
      {/* 標題列 */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-base font-semibold text-[--color-text-primary]">
            {repo.name}
          </h3>
          {repo.isPrivate && (
            <Lock
              size={12}
              strokeWidth={2}
              className="flex-shrink-0 text-[--color-text-muted]"
              aria-label="private repo"
            />
          )}
        </div>
        {repo.language && (
          <span className="badge flex-shrink-0">{repo.language}</span>
        )}
      </div>

      {/* 描述 */}
      {repo.description && (
        <p className="line-clamp-2 text-xs text-[--color-text-muted]">
          {repo.description}
        </p>
      )}

      {/* 進度 */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-[--color-text-secondary]">
          <span>
            {repo.closedMilestoneCount} / {repo.milestoneCount} milestones 完成
          </span>
          <span className="font-semibold text-[--color-text-primary]">{completionPct}%</span>
        </div>
        <ProgressBar value={repo.completionRate} />
      </div>

      {/* 下一個 milestone */}
      {repo.nextDueMilestone && (
        <div className="flex items-start gap-2 rounded-lg bg-[--color-surface-overlay] px-3 py-2">
          <Clock
            size={14}
            strokeWidth={2}
            className="mt-0.5 flex-shrink-0 text-[--color-brand]"
          />
          <div className="min-w-0 flex-1 text-xs">
            <div className="truncate font-medium text-[--color-text-primary]">
              {repo.nextDueMilestone.title}
            </div>
            <div className="text-[--color-text-muted]">
              {formatRelative(repo.nextDueMilestone.dueOn)}
            </div>
          </div>
        </div>
      )}

      {/* 逾期警示 */}
      {repo.overdueCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-orange-50 px-3 py-2 text-xs font-medium text-orange-600">
          <AlertTriangle size={14} strokeWidth={2} />
          <span>{repo.overdueCount} 個 milestone 逾期</span>
        </div>
      )}

      {/* 底部動作 */}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-[--color-border] pt-3">
        <Link
          to={`/repo/${repo.name}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-[--color-brand] hover:brightness-110"
        >
          查看 Roadmap
          <ArrowRight size={13} strokeWidth={2} />
        </Link>
        <a
          href={repo.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-[--color-text-muted] hover:text-[--color-text-secondary]"
        >
          GitHub
          <ExternalLink size={12} strokeWidth={2} />
        </a>
      </div>
    </div>
  );
};

export default RepoCard;
