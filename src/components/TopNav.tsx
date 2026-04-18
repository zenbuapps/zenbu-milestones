import { ExternalLink, LayoutDashboard, Menu } from 'lucide-react';
import type { Summary } from '../data/types';
import { formatRelative } from '../utils/date';

type TTopNavProps = {
  /** 載入中時為 null；載入後用來顯示最後更新時間 */
  summary: Summary | null;
  /** 手機版點擊漢堡按鈕觸發 */
  onMenuClick?: () => void;
};

const GITHUB_ORG_URL = 'https://github.com/zenbuapps';

/**
 * 頂部導覽列
 * 左側為（手機版）漢堡鈕 + 品牌 logo + 標題，右側顯示資料更新時間與 GitHub org 連結
 */
const TopNav = ({ summary, onMenuClick }: TTopNavProps) => (
  <header className="z-50 flex h-16 flex-shrink-0 items-center justify-between border-b border-[--color-border] bg-white px-3 sm:px-4">
    <div className="flex items-center gap-2 sm:gap-3">
      {onMenuClick && (
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="開啟選單"
          className="btn-ghost -ml-1 md:hidden"
        >
          <Menu size={20} strokeWidth={2} />
        </button>
      )}
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[--color-brand] text-white">
        <LayoutDashboard size={16} strokeWidth={2.25} />
      </div>
      <span className="text-sm font-semibold text-[--color-text-primary] sm:text-base">
        Zenbu Milestones
      </span>
    </div>

    <div className="flex items-center gap-2 sm:gap-4">
      {summary && (
        <span className="hidden text-xs text-[--color-text-muted] sm:inline">
          最後更新：{formatRelative(summary.generatedAt)}
        </span>
      )}
      <a
        href={GITHUB_ORG_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-ghost"
        aria-label="開啟 GitHub Org"
      >
        <ExternalLink size={16} strokeWidth={2} />
        <span className="hidden sm:inline">開啟 GitHub Org</span>
      </a>
    </div>
  </header>
);

export default TopNav;
