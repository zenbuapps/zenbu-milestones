import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type TStatCardProps = {
  /** 標籤（例如「活躍 Repos」） */
  label: string;
  /** 主數值（可以是數字或自訂節點） */
  value: ReactNode;
  /** lucide-react 圖示元件 */
  icon: LucideIcon;
  /** icon 方塊的色彩類（同時控制背景與前景文字），例如 "bg-blue-50 text-blue-600" */
  color: string;
  /** 數值下方的補充說明文字 */
  sub?: string;
};

/**
 * 統計卡片元件
 * 用於頁面頂部顯示核心指標，icon 方塊 + 數值 + 標籤
 */
const StatCard = ({ label, value, icon: Icon, color, sub }: TStatCardProps) => (
  <div className="card p-5 flex items-center gap-4">
    <div
      className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg ${color}`}
    >
      <Icon size={20} strokeWidth={2} />
    </div>
    <div className="min-w-0 flex-1">
      <div className="text-xs font-medium text-[--color-text-muted]">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold text-[--color-text-primary]">
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-[--color-text-muted]">{sub}</div>}
    </div>
  </div>
);

export default StatCard;
