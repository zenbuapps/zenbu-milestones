import { ChevronRight, LayoutDashboard, Lock, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import type { RepoSummary, Summary } from 'shared';

type TSidebarProps = {
  /** 載入中時為 null */
  summary: Summary | null;
  /**
   * 管理員標記為「不顯示於 UI」的 repo 集合（repoName，目前單一 zenbuapps org）
   * 傳入空 set 代表全部顯示（fallback；例如後端未部署時）
   */
  hiddenRepos?: Set<string>;
  /** 手機版 drawer 是否開啟；桌機版忽略此值（一律顯示） */
  isOpen?: boolean;
  /** 手機版 drawer 關閉回呼（點 NavLink、點 X、點 backdrop 皆觸發） */
  onClose?: () => void;
};

/**
 * 將 repo 按字母序排列（呼叫端可能已排序，但此處做一次保險）
 */
const sortByName = (a: RepoSummary, b: RepoSummary): number =>
  a.name.localeCompare(b.name);

/**
 * 主要導覽側邊欄
 * - 桌機（≥ md）常駐於左側（靜態佈局）
 * - 手機（< md）為 off-canvas drawer，由 TopNav 的漢堡按鈕觸發
 */
const Sidebar = ({ summary, hiddenRepos, isOpen = false, onClose }: TSidebarProps) => {
  const [showOthers, setShowOthers] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const { withRoadmaps, withoutRoadmaps } = useMemo(() => {
    if (!summary) {
      return { withRoadmaps: [] as RepoSummary[], withoutRoadmaps: [] as RepoSummary[] };
    }
    // 先套用 admin 的 visibleOnUI 過濾（hiddenRepos 來自 AppShell 的 /api/repos/settings）
    // hiddenRepos 未提供時視同空 set（fall back 全部顯示）
    const visible = hiddenRepos && hiddenRepos.size > 0
      ? summary.repos.filter((r) => !hiddenRepos.has(r.name))
      : summary.repos;
    const needle = searchQuery.trim().toLowerCase();
    const matchesQuery = (r: RepoSummary): boolean =>
      needle === '' || r.name.toLowerCase().includes(needle);
    const active = visible
      .filter((r) => r.roadmapCount > 0)
      .filter(matchesQuery)
      .slice()
      .sort(sortByName);
    const inactive = visible
      .filter((r) => r.roadmapCount === 0)
      .filter(matchesQuery)
      .slice()
      .sort(sortByName);
    return { withRoadmaps: active, withoutRoadmaps: inactive };
  }, [summary, hiddenRepos, searchQuery]);

  // 搜尋有命中「其他 repos」時自動展開該區段；清空搜尋後不強制收回（讓使用者手動控制）
  useEffect(() => {
    if (searchQuery.trim() !== '' && withoutRoadmaps.length > 0) {
      setShowOthers(true);
    }
  }, [searchQuery, withoutRoadmaps.length]);

  const isSearching = searchQuery.trim() !== '';

  const handleNavClick = () => {
    // 手機版點選後收起；桌機版 onClose 可忽略（state 不受影響）
    onClose?.();
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

        <div className="mt-4 mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-[--color-text-muted]">
          Repositories
        </div>

        {withRoadmaps.length === 0 && (
          <div className="px-3 py-2 text-xs text-[--color-text-muted]">
            {searchQuery.trim() === '' ? '尚無資料' : '找不到符合的 repo'}
          </div>
        )}

        {withRoadmaps.map((repo) => (
          <NavLink
            key={repo.name}
            to={`/repo/${repo.name}`}
            onClick={handleNavClick}
            className={({ isActive }) =>
              `flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
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
            <span className="flex-shrink-0 rounded-full bg-[--color-surface-overlay] px-1.5 py-0.5 text-[10px] font-medium text-[--color-text-muted]">
              {repo.roadmapCount}
            </span>
          </NavLink>
        ))}

        {/*
         * 搜尋進行中 + 「其他 repos」有命中 → 把該區段內嵌在 Repositories 後面、強制
         * 展開，避免使用者要捲到 sidebar 底部才看得到匹配結果（issue #4）。
         * 非搜尋時則維持原本 mt-auto 底端的 collapse 行為。
         */}
        {isSearching && withoutRoadmaps.length > 0 && (
          <>
            <div className="mt-4 mb-2 flex items-baseline justify-between px-3">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-[--color-text-muted]">
                其他 repos
              </span>
              <span className="text-[10px] font-medium text-[--color-text-muted]">
                找到 {withoutRoadmaps.length} 個
              </span>
            </div>
            {withoutRoadmaps.map((repo) => (
              <NavLink
                key={`search-${repo.name}`}
                to={`/repo/${repo.name}`}
                onClick={handleNavClick}
                className={({ isActive }) =>
                  `flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? 'bg-[--color-primary-50] font-semibold text-[--color-brand]'
                      : 'text-[--color-text-secondary] hover:bg-[--color-surface-overlay]'
                  }`
                }
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {repo.isPrivate && (
                    <Lock
                      size={12}
                      strokeWidth={2}
                      className="flex-shrink-0 text-[--color-text-muted]"
                    />
                  )}
                  <span className="truncate">{repo.name}</span>
                </span>
                <span className="flex-shrink-0 rounded-full bg-[--color-surface-overlay] px-1.5 py-0.5 text-[10px] font-medium text-[--color-text-muted]">
                  {repo.roadmapCount}
                </span>
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/*
       * 非搜尋狀態的「其他 repos」收合區：維持原本 mt-auto 卡底端 + chevron 可收合
       */}
      {!isSearching && withoutRoadmaps.length > 0 && (
        <div className="mt-auto border-t border-[--color-border] px-3 py-3">
          <button
            type="button"
            onClick={() => setShowOthers((v) => !v)}
            aria-expanded={showOthers}
            className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs font-medium text-[--color-text-muted] transition-colors hover:bg-[--color-surface-overlay]"
          >
            <span>其他 repos（無 roadmap）</span>
            <ChevronRight
              size={14}
              strokeWidth={2}
              className={`transition-transform ${showOthers ? 'rotate-90' : ''}`}
            />
          </button>
          {showOthers && (
            <ul className="mt-1 flex flex-col gap-1">
              {withoutRoadmaps.map((repo) => (
                <li key={repo.name}>
                  <NavLink
                    to={`/repo/${repo.name}`}
                    onClick={handleNavClick}
                    className={({ isActive }) =>
                      `flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                        isActive
                          ? 'bg-[--color-primary-50] font-semibold text-[--color-brand]'
                          : 'text-[--color-text-secondary] hover:bg-[--color-surface-overlay]'
                      }`
                    }
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      {repo.isPrivate && (
                        <Lock
                          size={12}
                          strokeWidth={2}
                          className="flex-shrink-0 text-[--color-text-muted]"
                        />
                      )}
                      <span className="truncate">{repo.name}</span>
                    </span>
                    <span className="flex-shrink-0 rounded-full bg-[--color-surface-overlay] px-1.5 py-0.5 text-[10px] font-medium text-[--color-text-muted]">
                      {repo.roadmapCount}
                    </span>
                  </NavLink>
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
