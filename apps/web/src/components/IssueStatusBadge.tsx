import { CheckCircle2, Clock, ExternalLink, XCircle } from 'lucide-react';
import type { IssueStatus } from 'shared';

/**
 * IssueStatusBadge
 * ---------------------------------------------------------------
 * 四種狀態的視覺差異：
 *
 *   pending           → 橘：待管理員審核
 *   approved          → 藍：已通過但尚未同步到 GitHub（極短暫的中間態）
 *   rejected          → 紅：被拒絕
 *   synced-to-github  → 綠：已轉發為真的 GitHub issue
 *
 * 顏色沿用 styling-system.rule.md 允許的 Tailwind 預設語意色（狀態用途的補充色）。
 */
type TIssueStatusBadgeProps = {
  status: IssueStatus;
};

const CONFIG: Record<
  IssueStatus,
  { label: string; icon: typeof Clock; wrapper: string }
> = {
  pending: {
    label: '待審核',
    icon: Clock,
    wrapper: 'bg-orange-50 text-orange-600 border border-orange-200',
  },
  approved: {
    label: '已通過',
    icon: CheckCircle2,
    wrapper: 'bg-blue-50 text-blue-600 border border-blue-200',
  },
  rejected: {
    label: '已拒絕',
    icon: XCircle,
    wrapper: 'bg-red-50 text-red-600 border border-red-200',
  },
  'synced-to-github': {
    label: '已轉 GitHub',
    icon: ExternalLink,
    wrapper: 'bg-green-50 text-green-600 border border-green-200',
  },
};

const IssueStatusBadge = ({ status }: TIssueStatusBadgeProps) => {
  const { label, icon: Icon, wrapper } = CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${wrapper}`}
    >
      <Icon size={12} strokeWidth={2.25} />
      {label}
    </span>
  );
};

export default IssueStatusBadge;
