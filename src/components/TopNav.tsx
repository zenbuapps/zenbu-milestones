import { ExternalLink, LayoutDashboard } from 'lucide-react';
import type { Summary } from '../data/types';
import { formatRelative } from '../utils/date';

type TTopNavProps = {
  /** 載入中時為 null；載入後用來顯示最後更新時間 */
  summary: Summary | null;
};

const GITHUB_ORG_URL = 'https://github.com/zenbuapps';

/**
 * 頂部導覽列
 * 左側為品牌 logo + 標題，右側顯示資料更新時間與 GitHub org 連結
 */
const TopNav = ({ summary }: TTopNavProps) => (
  <header className="z-50 flex h-16 flex-shrink-0 items-center justify-between border-b border-[--color-border] bg-white px-4">
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[--color-brand] text-white">
        <LayoutDashboard size={16} strokeWidth={2.25} />
      </div>
      <span className="text-base font-semibold text-[--color-text-primary]">
        Zenbu Milestones
      </span>
    </div>

    <div className="flex items-center gap-4">
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
      >
        <ExternalLink size={16} strokeWidth={2} />
        <span className="hidden sm:inline">開啟 GitHub Org</span>
      </a>
    </div>
  </header>
);

export default TopNav;
