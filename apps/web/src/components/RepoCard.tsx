import { AlertTriangle, ArrowRight, Clock, ExternalLink, Lock, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { RepoSummary } from 'shared';
import { formatRelative } from '../utils/date';
import ProgressBar from './ProgressBar';

type TRepoCardProps = {
  repo: RepoSummary;
  /** 是否已釘選（issue #16）；省略視為 false */
  pinned?: boolean;
  /** 點 star 按鈕呼叫 */
  onTogglePin?: () => void;
};

/**
 * Repository 卡片
 * 顯示語言、隱私、描述、roadmap 完成率、下一個 roadmap 與逾期警告
 * issue #16：左上角加 star 按鈕，方便從總覽 pin / unpin 此 repo。
 */
const RepoCard = ({ repo, pinned, onTogglePin }: TRepoCardProps) => {
  const completionPct = Math.round(repo.completionRate * 100);

  return (
    <div className="card flex flex-col gap-3 p-4 transition-shadow hover:shadow-md sm:p-5">
      {/* 標題列 */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {onTogglePin && (
            <button
              type="button"
              onClick={onTogglePin}
              aria-label={pinned ? `取消釘選 ${repo.name}` : `釘選 ${repo.name}`}
              aria-pressed={pinned}
              title={pinned ? '取消釘選' : '釘選 — 加入 Sidebar 預設清單'}
              className={`rounded p-1 transition-colors hover:bg-[--color-surface-overlay] ${
                pinned ? 'text-[--color-brand]' : 'text-[--color-text-muted]'
              }`}
            >
              <Star size={14} strokeWidth={2} fill={pinned ? 'currentColor' : 'none'} />
            </button>
          )}
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
            {repo.closedRoadmapCount} / {repo.roadmapCount} roadmaps 完成
          </span>
          <span className="font-semibold text-[--color-text-primary]">{completionPct}%</span>
        </div>
        <ProgressBar value={repo.completionRate} />
      </div>

      {/* 下一個 roadmap */}
      {repo.nextDueRoadmap && (
        <div className="flex items-start gap-2 rounded-lg bg-[--color-surface-overlay] px-3 py-2">
          <Clock
            size={14}
            strokeWidth={2}
            className="mt-0.5 flex-shrink-0 text-[--color-brand]"
          />
          <div className="min-w-0 flex-1 text-xs">
            <div className="truncate font-medium text-[--color-text-primary]">
              {repo.nextDueRoadmap.title}
            </div>
            <div className="text-[--color-text-muted]">
              {formatRelative(repo.nextDueRoadmap.dueOn)}
            </div>
          </div>
        </div>
      )}

      {/* 逾期警示 */}
      {repo.overdueCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-orange-50 px-3 py-2 text-xs font-medium text-orange-600">
          <AlertTriangle size={14} strokeWidth={2} />
          <span>{repo.overdueCount} 個 roadmap 逾期</span>
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
