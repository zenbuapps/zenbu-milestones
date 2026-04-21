import { Lock, LogIn } from 'lucide-react';
import { authUrls } from '../data/api';

type TRequireAuthGateProps = {
  /** 觸發登入的 callback；未傳則直接讀 authUrls.login() 的 full-page redirect */
  onLogin?: () => void;
};

/**
 * 「請先登入」全畫面 gate
 * ---------------------------------------------------------------
 * 當後端回 401（或 session 明確為 unauthenticated）時，頂層頁面可以改 render 此元件，
 * 取代一般的 EmptyState + 錯誤訊息 —— 給使用者清楚的下一步行動。
 *
 * 顯示條件由呼叫端判斷（AppShell / RoadmapPage），本元件只負責視覺與登入動作。
 *
 * 登入按鈕優先呼叫傳入的 onLogin（通常來自 useSession().login），
 * 若未傳則 fallback 直接跳 authUrls.login()。當後端未設定（authUrls.login() 回 null）時
 * 按鈕會 disabled，避免使用者點擊後無反應。
 */
const RequireAuthGate = ({ onLogin }: TRequireAuthGateProps) => {
  const loginUrl = authUrls.login();
  const canLogin = loginUrl !== null;

  const handleLogin = (): void => {
    if (onLogin) {
      onLogin();
      return;
    }
    if (loginUrl) {
      window.location.href = loginUrl;
    }
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="card flex w-full max-w-md flex-col items-center gap-4 px-6 py-10 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[--color-primary-50] text-[--color-brand]">
          <Lock size={28} strokeWidth={2} />
        </div>
        <h2 className="text-lg font-semibold text-[--color-text-primary]">
          請先登入以查看儀表板
        </h2>
        <p className="max-w-sm text-sm text-[--color-text-muted]">
          Zenbu Milestones 現在需要登入才能檢視各 repo 的進度。請使用 Google 帳號登入。
        </p>
        <button
          type="button"
          onClick={handleLogin}
          disabled={!canLogin}
          className="btn-primary mt-2"
        >
          <LogIn size={16} strokeWidth={2} />
          使用 Google 登入
        </button>
        {!canLogin && (
          <p className="text-xs text-[--color-text-muted]">
            後端服務尚未配置（VITE_API_BASE_URL 未設定）
          </p>
        )}
      </div>
    </div>
  );
};

export default RequireAuthGate;
