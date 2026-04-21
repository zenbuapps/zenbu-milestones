import { FileText, LogIn, LogOut, ShieldCheck, UserRound } from 'lucide-react';
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
 * - `loading`：顯示一個淡灰 skeleton 避免 UI 跳動
 * - `unavailable`：整塊不顯示（後端 API 未配置時不給登入入口，避免誤導）
 * - `unauthenticated`：顯示「以 Google 登入」按鈕
 * - `authenticated`：顯示 avatar + 名稱 + 登出圖示按鈕
 */
const UserMenu = ({ state, onLogin, onLogout }: TUserMenuProps) => {
  if (state.status === 'unavailable') return null;

  if (state.status === 'loading') {
    return <div className="h-9 w-24 animate-pulse rounded-lg bg-[--color-surface-overlay]" aria-hidden="true" />;
  }

  if (state.status === 'unauthenticated') {
    return (
      <button type="button" onClick={onLogin} className="btn-primary" aria-label="以 Google 登入">
        <LogIn size={16} strokeWidth={2} />
        <span className="hidden sm:inline">以 Google 登入</span>
        <span className="sm:hidden">登入</span>
      </button>
    );
  }

  const { user } = state;
  return (
    <div className="flex items-center gap-2">
      <div className="hidden items-center gap-2 sm:flex">
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.displayName}
            className="h-7 w-7 rounded-full border border-[--color-border]"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[--color-surface-overlay]">
            <UserRound size={14} strokeWidth={2} className="text-[--color-text-muted]" />
          </div>
        )}
        <div className="flex flex-col leading-tight">
          <span className="text-xs font-medium text-[--color-text-primary]">{user.displayName}</span>
          {user.role === 'admin' && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[--color-brand]">
              Admin
            </span>
          )}
        </div>
      </div>
      <Link to="/me/issues" className="btn-ghost" aria-label="我的 Issue" title="我的 Issue">
        <FileText size={16} strokeWidth={2} />
        <span className="hidden md:inline">我的 Issue</span>
      </Link>
      {user.role === 'admin' && (
        <Link to="/admin" className="btn-ghost" aria-label="管理員後台" title="管理員後台">
          <ShieldCheck size={16} strokeWidth={2} />
          <span className="hidden md:inline">後台</span>
        </Link>
      )}
      <button
        type="button"
        onClick={onLogout}
        className="btn-ghost"
        aria-label="登出"
        title={`登出 ${user.displayName}`}
      >
        <LogOut size={16} strokeWidth={2} />
        <span className="hidden sm:inline">登出</span>
      </button>
    </div>
  );
};

export default UserMenu;
