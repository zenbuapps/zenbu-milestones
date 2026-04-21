import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock,
  ExternalLink,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Milestone, MilestoneDerivedStatus } from '../data/types';
import { daysUntil, formatDate, formatRelative } from '../utils/date';
import { deriveMilestoneStatus } from '../utils/progress';
import IssueList from './IssueList';
import ProgressBar from './ProgressBar';
import StatusBadge from './StatusBadge';

type TMilestoneNodeProps = {
  milestone: Milestone;
  expanded: boolean;
  onToggle: () => void;
};

type TDotStyle = {
  bg: string;
  icon: LucideIcon;
};

const DOT_STYLE: Record<MilestoneDerivedStatus, TDotStyle> = {
  done: { bg: 'bg-green-500 text-white', icon: CheckCircle2 },
  in_progress: { bg: 'bg-blue-500 text-white', icon: Clock },
  overdue: { bg: 'bg-orange-500 text-white', icon: AlertTriangle },
  no_due: { bg: 'bg-gray-300 text-white', icon: Circle },
};

const PROGRESS_COLOR: Record<MilestoneDerivedStatus, 'brand' | 'success' | 'warning' | 'error'> = {
  done: 'success',
  in_progress: 'brand',
  overdue: 'error',
  no_due: 'brand',
};

/**
 * 依 milestone 狀態決定日期標籤文字
 */
const renderDateLabel = (m: Milestone, status: MilestoneDerivedStatus) => {
  if (status === 'done' && m.closedAt) {
    return (
      <span className="text-xs text-[--color-text-muted]">
        完成於 {formatDate(m.closedAt)}
      </span>
    );
  }
  if (status === 'in_progress' && m.dueOn) {
    return (
      <span className="text-xs text-[--color-text-muted]">
        到期 {formatRelative(m.dueOn)}（{formatDate(m.dueOn)}）
      </span>
    );
  }
  if (status === 'overdue' && m.dueOn) {
    const days = Math.abs(daysUntil(m.dueOn));
    return (
      <span className="text-xs font-medium text-[--color-error]">
        逾期 {days} 天（{formatDate(m.dueOn)}）
      </span>
    );
  }
  return <span className="text-xs text-[--color-text-muted]">未排程</span>;
};

/**
 * Milestone 時間軸節點
 * 左側狀態圓點 + 右側卡片（標題、狀態 badge、日期、進度、展開 issues）
 */
const MilestoneNode = ({ milestone, expanded, onToggle }: TMilestoneNodeProps) => {
  const status = deriveMilestoneStatus(milestone);
  const dotStyle = DOT_STYLE[status];
  const DotIcon = dotStyle.icon;
  const totalIssues = milestone.openIssues + milestone.closedIssues;
  const completionPct = Math.round(milestone.completion * 100);

  return (
    <div className="relative pb-6 pl-10 last:pb-0 sm:pb-8">
      {/* 狀態圓點，絕對定位在時間線上 */}
      <div
        className={`absolute left-0 top-1 flex h-8 w-8 items-center justify-center rounded-full ring-4 ring-[--color-surface] ${dotStyle.bg}`}
      >
        <DotIcon size={16} strokeWidth={2.5} />
      </div>

      {/* 卡片內容 */}
      <div className="card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={milestone.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-base font-semibold text-[--color-text-primary] hover:text-[--color-brand]"
              >
                {milestone.title}
                <ExternalLink size={13} strokeWidth={2} className="text-[--color-text-muted]" />
              </a>
              <StatusBadge status={status} />
            </div>
            <div className="mt-1">{renderDateLabel(milestone, status)}</div>
            {milestone.description && (
              <p className="mt-2 line-clamp-2 text-xs text-[--color-text-muted]">
                {milestone.description}
              </p>
            )}
          </div>
        </div>

        {/* 進度 */}
        <div className="mt-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs text-[--color-text-secondary]">
            <span>
              {milestone.closedIssues} / {totalIssues} issues 完成
            </span>
            <span className="font-semibold text-[--color-text-primary]">{completionPct}%</span>
          </div>
          <ProgressBar value={milestone.completion} color={PROGRESS_COLOR[status]} />
        </div>

        {/* 展開按鈕 */}
        {totalIssues > 0 && (
          <button
            type="button"
            onClick={onToggle}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[--color-brand] hover:brightness-110"
            aria-expanded={expanded}
          >
            <ChevronDown
              size={14}
              strokeWidth={2}
              className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
            {expanded ? '收起' : `展開 ${totalIssues} 個 issues`}
          </button>
        )}

        {expanded && <IssueList issues={milestone.issues} />}
      </div>
    </div>
  );
};

export default MilestoneNode;
