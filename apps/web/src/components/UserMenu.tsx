import {
  ChevronDown,
  FileText,
  LogIn,
  LogOut,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SessionState } from '../hooks/useSession';

type TUserMenuProps = {
  state: SessionState;
  onLogin: () => void;
  onLogout: () => void;
};

/**
 * TopNav 右側的使用者區塊。
 *
 * 顯示邏輯：
 * - `loading`：淡灰 skeleton 避免 UI 跳動
 * - `unavailable`：整塊不顯示（後端 API 未配置時不給登入入口）
 * - `unauthenticated`：顯示「以 Google 登入」按鈕
 * - `authenticated`：avatar 為 trigger，點擊展開 dropdown：
 *     · 我的 Issue           → /me/issues
 *     · Issue 審核（admin only） → /admin
 *     · 登出                 → onLogout
 *
 * dropdown 支援：點外部 / Esc 關閉；空白鍵 / Enter 觸發 trigger。
 */
const UserMenu = ({ state, onLogin, onLogout }: TUserMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleClickOutside = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) close();
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, close]);

  if (state.status === 'unavailable') return null;

  if (state.status === 'loading') {
    return (
      <div
        className="h-9 w-24 animate-pulse rounded-lg bg-[--color-surface-overlay]"
        aria-hidden="true"
      />
    );
  }

  if (state.status === 'unauthenticated') {
    return (
      <button
        type="button"
        onClick={onLogin}
        className="btn-primary"
        aria-label="以 Google 登入"
      >
        <LogIn size={16} strokeWidth={2} />
        <span className="hidden sm:inline">以 Google 登入</span>
        <span className="sm:hidden">登入</span>
      </button>
    );
  }

  const { user } = state;
  const isAdmin = user.role === 'admin';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`使用者選單（${user.displayName}）`}
        className="flex items-center gap-1.5 rounded-full p-0.5 transition-colors hover:bg-[--color-surface-overlay] focus:outline-none focus:ring-2 focus:ring-[--color-brand-ring]"
      >
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.displayName}
            className="h-8 w-8 rounded-full border border-[--color-border]"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[--color-surface-overlay]">
            <UserRound size={16} strokeWidth={2} className="text-[--color-text-muted]" />
          </div>
        )}
        <ChevronDown
          size={14}
          strokeWidth={2}
          className={`hidden text-[--color-text-muted] transition-transform sm:inline ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label="使用者選單"
          className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-lg border border-[--color-border] bg-white py-1 shadow-lg"
        >
          {/* 使用者資訊 header */}
          <div className="border-b border-[--color-border] px-3 py-2">
            <div className="truncate text-sm font-medium text-[--color-text-primary]">
              {user.displayName}
            </div>
            <div className="truncate text-xs text-[--color-text-muted]">{user.email}</div>
            {isAdmin && (
              <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-[--color-primary-50] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[--color-brand]">
                <ShieldCheck size={10} strokeWidth={2.5} />
                Admin
              </div>
            )}
          </div>

          <Link
            to="/me/issues"
            role="menuitem"
            onClick={close}
            className="flex items-center gap-2 px-3 py-2 text-sm text-[--color-text-secondary] transition-colors hover:bg-[--color-surface-overlay]"
          >
            <FileText size={14} strokeWidth={2} className="text-[--color-text-muted]" />
            我的 Issue
          </Link>

          {isAdmin && (
            <Link
              to="/admin"
              role="menuitem"
              onClick={close}
              className="flex items-center gap-2 px-3 py-2 text-sm text-[--color-text-secondary] transition-colors hover:bg-[--color-surface-overlay]"
            >
              <ShieldCheck size={14} strokeWidth={2} className="text-[--color-text-muted]" />
              Issue 審核
            </Link>
          )}

          <div className="my-1 border-t border-[--color-border]" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close();
              onLogout();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[--color-text-secondary] transition-colors hover:bg-[--color-surface-overlay]"
          >
            <LogOut size={14} strokeWidth={2} className="text-[--color-text-muted]" />
            登出
          </button>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
