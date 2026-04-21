import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type TEmptyStateProps = {
  /** lucide-react 圖示元件 */
  icon: LucideIcon;
  /** 主標題 */
  title: string;
  /** 輔助說明文字 */
  description?: string;
  /** 動作按鈕或連結 */
  action?: ReactNode;
};

/**
 * 空狀態 / 錯誤狀態元件
 * 用於無資料、載入失敗、搜尋無結果等場景
 */
const EmptyState = ({
  icon: Icon,
  title,
  description,
  action,
}: TEmptyStateProps) => (
  <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[--color-border] bg-white px-6 py-16 text-center">
    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[--color-surface-overlay] text-[--color-text-muted]">
      <Icon size={28} strokeWidth={1.5} />
    </div>
    <h3 className="text-base font-semibold text-[--color-text-primary]">{title}</h3>
    {description && (
      <p className="max-w-md text-sm text-[--color-text-muted]">{description}</p>
    )}
    {action && <div className="mt-2">{action}</div>}
  </div>
);

export default EmptyState;
