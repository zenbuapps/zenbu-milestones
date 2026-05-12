import { LayoutDashboard, Menu, RefreshCw } from 'lucide-react';
import type { Summary } from 'shared';
import type { SessionState } from '../hooks/useSession';
import { formatRelative } from '../utils/date';
import UserMenu from './UserMenu';

type TTopNavProps = {
  /** 載入中時為 null；載入後用來顯示最後更新時間 */
  summary: Summary | null;
  /** 手機版點擊漢堡按鈕觸發 */
  onMenuClick?: () => void;
  /** 登入狀態；由 AppShell 透過 useSession() 傳入 */
  session?: SessionState;
  onLogin?: () => void;
  onLogout?: () => void;
  /** 重新拉取 summary（手動更新按鈕） */
  onRefresh?: () => void;
  /** refresh 進行中（按鈕圖示旋轉、disabled） */
  isRefreshing?: boolean;
};

/**
 * 頂部導覽列
 * 左側：（手機版）漢堡鈕 + 品牌 logo + 標題
 * 右側：最後更新時間 + 手動重新整理 icon + UserMenu（含 dropdown）
 *
 * GitHub Org 連結已遷移到 Footer（issue #7）。
 */
const TopNav = ({
  summary,
  onMenuClick,
  session,
  onLogin,
  onLogout,
  onRefresh,
  isRefreshing,
}: TTopNavProps) => (
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
        Zenbu Roadmaps
      </span>
    </div>

    <div className="flex items-center gap-2 sm:gap-3">
      {summary && (
        <span className="hidden text-xs text-[--color-text-muted] lg:inline">
          最後更新：{formatRelative(summary.generatedAt)}
        </span>
      )}
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-label="重新整理資料"
          title="重新整理資料"
          className="btn-ghost"
        >
          <RefreshCw
            size={16}
            strokeWidth={2}
            className={isRefreshing ? 'animate-spin' : ''}
          />
        </button>
      )}
      {session && onLogin && onLogout && (
        <UserMenu state={session} onLogin={onLogin} onLogout={onLogout} />
      )}
    </div>
  </header>
);

export default TopNav;
