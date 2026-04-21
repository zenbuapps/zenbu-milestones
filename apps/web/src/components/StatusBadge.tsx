import { AlertTriangle, CheckCircle2, Circle, Clock } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { MilestoneDerivedStatus } from 'shared';

type TStatusBadgeProps = {
  /** milestone 推導狀態 */
  status: MilestoneDerivedStatus;
};

type TBadgeStyle = {
  label: string;
  className: string;
  icon: LucideIcon;
};

const STYLE_MAP: Record<MilestoneDerivedStatus, TBadgeStyle> = {
  done: {
    label: '已完成',
    className: 'bg-green-50 text-green-600',
    icon: CheckCircle2,
  },
  in_progress: {
    label: '進行中',
    className: 'bg-blue-50 text-blue-600',
    icon: Clock,
  },
  overdue: {
    label: '逾期',
    className: 'bg-orange-50 text-orange-500',
    icon: AlertTriangle,
  },
  no_due: {
    label: '未排程',
    className: 'bg-gray-100 text-gray-500',
    icon: Circle,
  },
};

/**
 * Milestone 狀態標籤
 * 依 4 種推導狀態顯示對應顏色的 pill badge
 */
const StatusBadge = ({ status }: TStatusBadgeProps) => {
  const style = STYLE_MAP[status];
  const Icon = style.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${style.className}`}
    >
      <Icon size={12} strokeWidth={2.25} />
      {style.label}
    </span>
  );
};

export default StatusBadge;
