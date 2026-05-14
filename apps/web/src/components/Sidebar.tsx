import { ChevronRight, LayoutDashboard, Lock, Pin, PinOff, Search, Star, X } from 'lucide-react';
import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Link, NavLink } from 'react-router-dom';
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
        <span className="rounded-full bg-[--color-surface-overlay] px-1.5 py-0.5 text-[10px] font-medium text-[--color-text-muted]">
          {repo.roadmapCount}
        </span>
        <button
          type="button"
          onClick={handleStarClick}
          aria-label={pinned ? `取消釘選 ${repo.name}` : `釘選 ${repo.name}`}
          aria-pressed={pinned}
          title={pinned ? '取消釘選' : '釘選'}
          className={`rounded p-1 transition-colors hover:bg-[--color-surface-overlay] ${
            pinned ? 'text-[--color-brand]' : 'text-[--color-text-muted] opacity-0 group-hover:opacity-100 focus:opacity-100'
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
