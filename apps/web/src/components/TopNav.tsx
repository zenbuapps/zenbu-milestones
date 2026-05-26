import { LayoutDashboard, Menu, RefreshCw, Search } from 'lucide-react';
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
  /** issue #35：打開全域命令面板（也可用 Ctrl+K / Cmd+K 觸發） */
  onOpenPalette?: () => void;
};

/**
 * 偵測 macOS 與否，用於在 TopNav 顯示 ⌘K vs Ctrl+K 提示。
 * 寫成獨立函式而非 hook，避免 SSR 與 useEffect 開銷。
 */
const isMacPlatform = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  // navigator.platform 雖被標 deprecated，但對 macOS 偵測仍最可靠且廣為相容
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
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
  onOpenPalette,
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
      {/*
       * issue #35：全域搜尋觸發按鈕
       * - 桌機：寬版按鈕（搜尋圖示 + 「搜尋…」+ ⌘K / Ctrl+K kbd）
       * - 手機：壓縮為 icon-only
       * Ctrl+K / Cmd+K 一律可從鍵盤觸發；此按鈕只是視覺 affordance
       */}
      {onOpenPalette && (
        <button
          type="button"
          onClick={onOpenPalette}
          aria-label="開啟搜尋面板（Ctrl + K）"
          title="搜尋（Ctrl + K / Cmd + K）"
          className="inline-flex items-center gap-2 rounded-lg border border-[--color-border] bg-[--color-surface] px-2.5 py-1.5 text-xs text-[--color-text-muted] transition-colors hover:bg-[--color-surface-overlay] sm:px-3"
        >
          <Search size={14} strokeWidth={2} />
          <span className="hidden sm:inline">搜尋…</span>
          <kbd className="hidden rounded border border-[--color-border] bg-white px-1 py-0.5 text-[10px] font-medium text-[--color-text-muted] sm:inline">
            {isMacPlatform() ? '⌘K' : 'Ctrl+K'}
          </kbd>
        </button>
      )}
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
