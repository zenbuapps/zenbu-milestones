import {
  ChevronRight,
  Inbox,
  LayoutDashboard,
  Lock,
  Pin,
  PinOff,
  Search,
  Star,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import type { RepoSummary, Summary } from 'shared';

type TSidebarProps = {
  /** 載入中時為 null */
  summary: Summary | null;
  /**
   * 管理員標記為「不顯示於 UI」的 repo 集合（repoName，目前單一 zenbuapps org）
   * 傳入空 set 代表全部顯示（fallback；例如後端未部署時）
   */
  hiddenRepos?: Set<string>;
  /**
   * 個人化釘選清單（issue #16）。key 為 `${owner}/${name}`；
   * Sidebar 預設只顯示 pin 過的 repo，其餘 repo 折疊在「未釘選 repos」區段。
   */
  pinnedRepos: Set<string>;
  /** 點 star icon 時呼叫；樂觀更新由父層處理 */
  onTogglePin: (repoOwner: string, repoName: string) => Promise<void> | void;
  /** 是否顯示 admin 專用區段（issue #23：使用者列表 / 待審核 Issue） */
  isAdmin?: boolean;
  /** 手機版 drawer 是否開啟；桌機版忽略此值（一律顯示） */
  isOpen?: boolean;
  /** 手機版 drawer 關閉回呼（點 NavLink、點 X、點 backdrop 皆觸發） */
  onClose?: () => void;
};

/** 目前所有 repo 預設 owner 為 zenbuapps；shared 沒在 RepoSummary 上帶 owner */
const DEFAULT_OWNER = 'zenbuapps';
const pinKey = (owner: string, name: string): string => `${owner}/${name}`;

/** 將 repo 按字母序排列（呼叫端可能已排序，但此處做一次保險） */
const sortByName = (a: RepoSummary, b: RepoSummary): number =>
  a.name.localeCompare(b.name);

/**
 * 依 open issue 數量回對應的 badge 樣式（issue #18）
 * - 0：中性灰（避免畫面整片紅）
 * - 1–5：輕度（綠）
 * - 6–10：中度（橘）
 * - ≥ 11：嚴重（紅）
 * 色票沿用既有 design system 既有用法（StatCard / IssueStatusBadge 已用過這幾組）
 */
const badgeClassesForOpenIssues = (count: number): string => {
  if (count <= 0) return 'bg-[--color-surface-overlay] text-[--color-text-muted]';
  if (count <= 5) return 'bg-green-50 text-green-700';
  if (count <= 10) return 'bg-orange-50 text-orange-700';
  return 'bg-red-50 text-red-700';
};

type TAdminNavLinkProps = {
  /** 帶 query string 的目標路徑，例如 `/admin?tab=users` */
  to: string;
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
};

/**
 * Sidebar 用的 admin NavLink（issue #23）
 *
 * 不能直接用 react-router 的 NavLink isActive 判斷，因為兩個 link 都指向
 * `/admin`、僅 `?tab=` 不同；NavLink 只看 pathname。這裡用 useLocation 抓
 * 當前 search 比對 tab 參數。HashRouter 下 location.pathname 與 location.search
 * 都會反映 `#/admin?tab=...`，行為等同 BrowserRouter。
 */
const AdminNavLink = ({ to, icon: Icon, label, onClick }: TAdminNavLinkProps) => {
  const location = useLocation();
  // to 形如 '/admin?tab=users'；splitIdx 為 '?' 位置
  const qIdx = to.indexOf('?');
  const toPath = qIdx >= 0 ? to.slice(0, qIdx) : to;
  const toQuery = qIdx >= 0 ? to.slice(qIdx + 1) : '';
  const toParams = new URLSearchParams(toQuery);
  const currentParams = new URLSearchParams(location.search);
  // 同 path + tab 參數一致 → active
  const isActive =
    location.pathname === toPath && currentParams.get('tab') === toParams.get('tab');
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
        isActive
          ? 'bg-[--color-primary-50] font-semibold text-[--color-brand]'
          : 'text-[--color-text-secondary] hover:bg-[--color-surface-overlay]'
      }`}
      aria-current={isActive ? 'page' : undefined}
    >
      <Icon size={18} strokeWidth={2} />
      {label}
    </Link>
  );
};

type TRepoNavItemProps = {
  repo: RepoSummary;
  pinned: boolean;
  onTogglePin: (owner: string, name: string) => void;
  onNavClick: () => void;
  /** 自訂 key prefix，避免 inline 與 collapse 兩處同 repo 重渲染衝突 */
  keyPrefix?: string;
};

/**
 * Sidebar 單一 repo 連結 + star pin 按鈕。
 * 為了不讓 star 點擊觸發 NavLink 導航，star 按鈕加 stopPropagation + preventDefault。
 */
const RepoNavItem = ({ repo, pinned, onTogglePin, onNavClick }: TRepoNavItemProps) => {
  const handleStarClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onTogglePin(DEFAULT_OWNER, repo.name);
  };
  return (
    <NavLink
      to={`/repo/${repo.name}`}
      onClick={onNavClick}
      className={({ isActive }) =>
        `group flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
          isActive
            ? 'bg-[--color-primary-50] font-semibold text-[--color-brand]'
            : 'text-[--color-text-secondary] hover:bg-[--color-surface-overlay]'
        }`
      }
    >
      <span className="flex min-w-0 items-center gap-1.5">
        {repo.isPrivate && (
          <Lock size={12} strokeWidth={2} className="flex-shrink-0 text-[--color-text-muted]" />
        )}
        <span className="truncate">{repo.name}</span>
      </span>
      <span className="flex flex-shrink-0 items-center gap-1">
        {/*
         * issue #18：badge 改顯示 open issue 數，並依「全 GitHub open issue 計數」
         * 套警示色階（0 中性 / 1–5 綠 / 6–10 橘 / ≥11 紅）。
         * title 揭示完整含義，避免使用者誤以為這是 roadmap 數。
         */}
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${badgeClassesForOpenIssues(repo.openIssues)}`}
          title={`${repo.openIssues} open issues · ${repo.roadmapCount} roadmaps`}
        >
          {repo.openIssues}
        </span>
        {/*
         * issue #20：兩種狀態都預設隱藏星星，整列 hover 或 button focus 時才顯現。
         * - pinned 仍維持 brand 藍（hover 後就會看到「藍色星星」可點以取消釘選）
         * - 未釘選為灰星（hover 後出現提示可點以釘選）
         * 透過 `opacity-0 group-hover:opacity-100 focus:opacity-100` 統一控制顯示時機
         * 整列的 group hover class 已掛在外層 NavLink 上
         */}
        <button
          type="button"
          onClick={handleStarClick}
          aria-label={pinned ? `取消釘選 ${repo.name}` : `釘選 ${repo.name}`}
          aria-pressed={pinned}
          title={pinned ? '取消釘選' : '釘選'}
          className={`rounded p-1 opacity-0 transition-colors hover:bg-[--color-surface-overlay] group-hover:opacity-100 focus:opacity-100 ${
            pinned ? 'text-[--color-brand]' : 'text-[--color-text-muted]'
          }`}
        >
          <Star size={12} strokeWidth={2} fill={pinned ? 'currentColor' : 'none'} />
        </button>
      </span>
    </NavLink>
  );
};

/**
 * 主要導覽側邊欄
 * - 桌機（≥ md）常駐於左側（靜態佈局）
 * - 手機（< md）為 off-canvas drawer，由 TopNav 的漢堡按鈕觸發
 *
 * issue #16：預設清單從「有 Milestone」改為「使用者釘選」。
 *   - 上方主清單：pinnedRepos 命中的 repo（依字母序）
 *   - 下方收合區：未釘選的 repo（用 chevron 展開；搜尋時內嵌在主清單後方）
 *   - pinnedRepos 為空 → 顯示「尚未釘選任何 repo」提示，引導使用者展開下方清單
 */
const Sidebar = ({
  summary,
  hiddenRepos,
  pinnedRepos,
  onTogglePin,
  isAdmin = false,
  isOpen = false,
  onClose,
}: TSidebarProps) => {
  const [showOthers, setShowOthers] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const { pinned, unpinned } = useMemo(() => {
    if (!summary) {
      return { pinned: [] as RepoSummary[], unpinned: [] as RepoSummary[] };
    }
    // 先套用 admin 的 visibleOnUI 過濾（hiddenRepos 來自 AppShell 的 /api/repos/settings）
    const visible = hiddenRepos && hiddenRepos.size > 0
      ? summary.repos.filter((r) => !hiddenRepos.has(r.name))
      : summary.repos;
    const needle = searchQuery.trim().toLowerCase();
    const matchesQuery = (r: RepoSummary): boolean =>
      needle === '' || r.name.toLowerCase().includes(needle);
    const pinnedList = visible
      .filter((r) => pinnedRepos.has(pinKey(DEFAULT_OWNER, r.name)))
      .filter(matchesQuery)
      .slice()
      .sort(sortByName);
    const unpinnedList = visible
      .filter((r) => !pinnedRepos.has(pinKey(DEFAULT_OWNER, r.name)))
      .filter(matchesQuery)
      .slice()
      .sort(sortByName);
    return { pinned: pinnedList, unpinned: unpinnedList };
  }, [summary, hiddenRepos, pinnedRepos, searchQuery]);

  // 搜尋有命中「未釘選 repos」時自動展開；清空搜尋後不強制收回
  useEffect(() => {
    if (searchQuery.trim() !== '' && unpinned.length > 0) {
      setShowOthers(true);
    }
  }, [searchQuery, unpinned.length]);

  const isSearching = searchQuery.trim() !== '';

  const handleNavClick = () => {
    onClose?.();
  };
  const handleTogglePin = (owner: string, name: string) => {
    void onTogglePin(owner, name);
  };

  return (
    <aside
      className={`fixed inset-y-0 left-0 top-16 z-40 flex w-[260px] max-w-[80vw] flex-shrink-0 flex-col overflow-y-auto border-r border-[--color-border] bg-white transition-transform duration-200 md:static md:top-0 md:w-[220px] md:translate-x-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      {/* 手機版頂部關閉按鈕 */}
      <div className="flex items-center justify-end px-2 py-2 md:hidden">
        <button
          type="button"
          onClick={onClose}
          aria-label="關閉選單"
          className="btn-ghost"
        >
          <X size={18} strokeWidth={2} />
        </button>
      </div>

      <nav className="flex flex-col gap-1 px-3 pb-4 md:pt-4">
        <NavLink
          to="/"
          end
          onClick={handleNavClick}
          className={({ isActive }) =>
            `flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
              isActive
                ? 'bg-[--color-primary-50] font-semibold text-[--color-brand]'
                : 'text-[--color-text-secondary] hover:bg-[--color-surface-overlay]'
            }`
          }
        >
          <LayoutDashboard size={18} strokeWidth={2} />
          總覽
        </NavLink>

        {/*
         * Admin 專用區段（issue #23）：使用者列表 / 待審核 Issue
         * - 一般使用者一律不渲染（前端 + 後端 AdminGuard 雙層保護）
         * - 直接指向既有 AdminPage 的 tab，URL 為 hash router 下 `/admin?tab=...`
         * - 兩個 NavLink 用 useMatch 的方式判斷 active 比較複雜，這裡用 className 函式
         *   讀 isActive 但因為 hash router 的 search param 切換不會改 pathname，
         *   兩個 link 在 /admin 路徑下會同時 active —— 改用 location 比對 search
         */}
        {isAdmin && (
          <>
            <div className="mt-3 mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-[--color-text-muted]">
              管理員
            </div>
            <AdminNavLink
              to="/admin?tab=users"
              icon={Users}
              label="使用者列表"
              onClick={handleNavClick}
            />
            <AdminNavLink
              to="/admin?tab=issues"
              icon={Inbox}
              label="待審核 Issue"
              onClick={handleNavClick}
            />
          </>
        )}

        <div className="relative mt-3">
          <Search
            size={14}
            strokeWidth={2}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[--color-text-muted]"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜尋 repo"
            aria-label="搜尋 repo"
            className="w-full rounded-lg border border-[--color-border] bg-white py-1.5 pl-8 pr-7 text-sm text-[--color-text-primary] placeholder:text-[--color-text-muted] focus:border-[--color-brand] focus:outline-none focus:ring-2 focus:ring-[--color-brand-ring]"
          />
          {searchQuery !== '' && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="清除搜尋"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-[--color-text-muted] hover:bg-[--color-surface-overlay] hover:text-[--color-text-secondary]"
            >
              <X size={12} strokeWidth={2.25} />
            </button>
          )}
        </div>

        <div className="mt-4 mb-2 flex items-baseline justify-between px-3">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-[--color-text-muted]">
            已釘選 Repos
          </span>
          {pinned.length > 0 && (
            <span className="text-[10px] font-medium text-[--color-text-muted]">
              {pinned.length}
            </span>
          )}
        </div>

        {pinned.length === 0 && (
          <div className="rounded-lg border border-dashed border-[--color-border] bg-[--color-surface] px-3 py-3 text-xs text-[--color-text-muted]">
            {isSearching ? (
              <>找不到符合的釘選 repo</>
            ) : (
              <div className="flex flex-col gap-1">
                <span className="inline-flex items-center gap-1 text-[--color-text-secondary]">
                  <Pin size={12} strokeWidth={2} />
                  尚未釘選任何 repo
                </span>
                <span>
                  到下方「未釘選 repos」展開或在
                  {' '}
                  <Link to="/" onClick={handleNavClick} className="text-[--color-brand] underline">
                    總覽
                  </Link>
                  {' '}
                  點 ⭐ 加入。
                </span>
              </div>
            )}
          </div>
        )}

        {pinned.map((repo) => (
          <RepoNavItem
            key={`pin-${repo.name}`}
            repo={repo}
            pinned
            onTogglePin={handleTogglePin}
            onNavClick={handleNavClick}
          />
        ))}

        {/*
         * 搜尋進行中 + 「未釘選 repos」有命中 → 內嵌在主清單後面（issue #4 視覺一致）。
         */}
        {isSearching && unpinned.length > 0 && (
          <>
            <div className="mt-4 mb-2 flex items-baseline justify-between px-3">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-[--color-text-muted]">
                未釘選 repos
              </span>
              <span className="text-[10px] font-medium text-[--color-text-muted]">
                找到 {unpinned.length} 個
              </span>
            </div>
            {unpinned.map((repo) => (
              <RepoNavItem
                key={`search-${repo.name}`}
                repo={repo}
                pinned={false}
                onTogglePin={handleTogglePin}
                onNavClick={handleNavClick}
              />
            ))}
          </>
        )}
      </nav>

      {/*
       * 非搜尋狀態的「未釘選 repos」收合區：維持 mt-auto 卡底端 + chevron 收合
       */}
      {!isSearching && unpinned.length > 0 && (
        <div className="mt-auto border-t border-[--color-border] px-3 py-3">
          <button
            type="button"
            onClick={() => setShowOthers((v) => !v)}
            aria-expanded={showOthers}
            className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs font-medium text-[--color-text-muted] transition-colors hover:bg-[--color-surface-overlay]"
          >
            <span className="inline-flex items-center gap-1">
              <PinOff size={12} strokeWidth={2} />
              未釘選 repos（{unpinned.length}）
            </span>
            <ChevronRight
              size={14}
              strokeWidth={2}
              className={`transition-transform ${showOthers ? 'rotate-90' : ''}`}
            />
          </button>
          {showOthers && (
            <ul className="mt-1 flex flex-col gap-1">
              {unpinned.map((repo) => (
                <li key={repo.name}>
                  <RepoNavItem
                    repo={repo}
                    pinned={false}
                    onTogglePin={handleTogglePin}
                    onNavClick={handleNavClick}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
