import type { ReactNode } from 'react';

type TPageHeaderProps = {
  /** 頁面主標題（可含 icon 等節點） */
  title: ReactNode;
  /** 副標題或簡短描述，顯示在標題下方 */
  description?: string;
  /** 右側動作區塊（按鈕、連結等） */
  action?: ReactNode;
};

/**
 * 頁面標頭元件
 * 提供統一的頁面標題樣式，左側放標題 + 描述，右側可放動作按鈕
 */
const PageHeader = ({ title, description, action }: TPageHeaderProps) => (
  <div className="mb-6 flex items-start justify-between gap-4">
    <div className="min-w-0 flex-1">
      <h1 className="text-xl font-semibold text-[--color-text-primary]">{title}</h1>
      {description && (
        <p className="mt-1 text-sm text-[--color-text-muted]">{description}</p>
      )}
    </div>
    {action && <div className="flex-shrink-0">{action}</div>}
  </div>
);

export default PageHeader;
