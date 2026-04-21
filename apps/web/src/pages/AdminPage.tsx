/**
 * AdminPage（路徑：#/admin?tab=issues|repos|users）
 * ---------------------------------------------------------------
 * 管理員後台三分頁：issue 審核 / repo 設定 / 使用者權限。
 *
 * 頂層 guard（plan.md §M4）：
 *   session 狀態         → 呈現
 *   loading              → LoadingSpinner
 *   unavailable          → EmptyState「後端未配置」
 *   unauthenticated      → EmptyState「需要登入」+ login 按鈕
 *   authenticated, !admin → EmptyState「403 權限不足」
 *   authenticated, admin  → 三分頁內容
 *
 * Tab state：存在 URL search param（`?tab=issues`），理由：
 * 1. 直接複製網址即可分享特定分頁（reload / bookmark 友好）
 * 2. 瀏覽器前後退與 tab 切換自然對應
 * 3. 比起獨立 hash sub-route（`#/admin/issues`）佈線更少，切換無 route mount 成本
 *
 * HashRouter 搭配 useSearchParams 註記：
 * - react-router v6 的 useSearchParams 會讀 hash route 中的 `?` 之後部分
 *   → URL 實際長這樣：`https://foo/#/admin?tab=repos`
 * - 切 tab 時用 setSearchParams 不會觸發頁面重載、只更新 hash
 */

import { AlertOctagon, Inbox, LogIn, Settings, ShieldAlert, Users } from 'lucide-react';
import { useMemo } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import type { TAppShellContext } from '../AppShell';
import EmptyState from '../components/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner';
import PageHeader from '../components/PageHeader';
import IssueReviewTable from '../components/admin/IssueReviewTable';
import RepoSettingsTable from '../components/admin/RepoSettingsTable';
import UserRoleTable from '../components/admin/UserRoleTable';

/** 可用分頁識別 */
type TAdminTab = 'issues' | 'repos' | 'users';

const TABS: Array<{ value: TAdminTab; label: string; icon: typeof Inbox }> = [
  { value: 'issues', label: 'Issue 審核', icon: Inbox },
  { value: 'repos', label: 'Repo 設定', icon: Settings },
  { value: 'users', label: '使用者權限', icon: Users },
];

/** 合法化 URL 的 tab 參數 */
const parseTab = (raw: string | null): TAdminTab => {
  if (raw === 'repos' || raw === 'users') return raw;
  return 'issues';
};

const AdminPage = () => {
  const { session } = useOutletContext<TAppShellContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get('tab'));

  const setTab = (next: TAdminTab) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', next);
    // replace=false → 切 tab 時保留瀏覽歷史（Back 按鈕回到上一個 tab）
    setSearchParams(params, { replace: false });
  };

  // ------------------- guards -------------------
  if (session.state.status === 'loading') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (session.state.status === 'unavailable') {
    return (
      <EmptyState
        icon={AlertOctagon}
        title="後端服務未配置"
        description="VITE_API_BASE_URL 未設定，管理員後台需要連線後端才能使用"
      />
    );
  }

  if (session.state.status === 'unauthenticated') {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <EmptyState
          icon={LogIn}
          title="需要登入"
          description="管理員後台僅限具備 admin 權限的帳號使用，請先以 Google 登入"
        />
        <button type="button" onClick={session.login} className="btn-primary">
          <LogIn size={16} strokeWidth={2} />
          以 Google 登入
        </button>
      </div>
    );
  }

  // authenticated + 非 admin
  if (session.state.user.role !== 'admin') {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="權限不足（403）"
        description="您的帳號尚未被授予管理員權限。如需申請，請聯絡現任管理員。"
      />
    );
  }

  return <AdminPanel tab={tab} onTabChange={setTab} />;
};

// ===========================================================================
// AdminPanel — 僅在 role=admin 時渲染，負責 tabs + 對應 content
// ===========================================================================

type TAdminPanelProps = {
  tab: TAdminTab;
  onTabChange: (next: TAdminTab) => void;
};

const AdminPanel = ({ tab, onTabChange }: TAdminPanelProps) => {
  const activeTab = useMemo(() => TABS.find((t) => t.value === tab) ?? TABS[0]!, [tab]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="管理員後台"
        description="審核 issue 草稿、控制 repo 投稿設定、管理使用者權限"
      />

      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="管理員分頁"
        className="flex items-center gap-1 overflow-x-auto border-b border-[--color-border]"
      >
        {TABS.map((t) => {
          const active = t.value === tab;
          const Icon = t.icon;
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTabChange(t.value)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'border-[--color-brand] text-[--color-brand]'
                  : 'border-transparent text-[--color-text-muted] hover:text-[--color-text-primary]'
              }`}
            >
              <Icon size={14} strokeWidth={2.25} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content — 以 key 強制在切換時重新 mount 子元件，確保內部 state 乾淨 */}
      <div role="tabpanel" aria-labelledby={`tab-${activeTab.value}`} className="pt-2">
        {tab === 'issues' && <IssueReviewTable key="issues" />}
        {tab === 'repos' && <RepoSettingsTable key="repos" />}
        {tab === 'users' && <UserRoleTable key="users" />}
      </div>
    </div>
  );
};

export default AdminPage;
