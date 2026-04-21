import { ChevronRight, ExternalLink, LayoutDashboard, Lock, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import type { RepoSummary, Summary } from '../data/types';

type TSidebarProps = {
  /** 載入中時為 null */
  summary: Summary | null;
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
const Sidebar = ({ summary, isOpen = false, onClose }: TSidebarProps) => {
  const [showOthers, setShowOthers] = useState<boolean>(false);

  const { withMilestones, withoutMilestones } = useMemo(() => {
    if (!summary) {
      return { withMilestones: [] as RepoSummary[], withoutMilestones: [] as RepoSummary[] };
    }
    const active = summary.repos.filter((r) => r.milestoneCount > 0).slice().sort(sortByName);
    const inactive = summary.repos.filter((r) => r.milestoneCount === 0).slice().sort(sortByName);
    return { withMilestones: active, withoutMilestones: inactive };
  }, [summary]);

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

        <div className="mt-4 mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-[--color-text-muted]">
          Repositories
        </div>

        {withMilestones.length === 0 && (
          <div className="px-3 py-2 text-xs text-[--color-text-muted]">尚無資料</div>
        )}

        {withMilestones.map((repo) => (
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
              {repo.milestoneCount}
            </span>
          </NavLink>
        ))}
      </nav>

      {withoutMilestones.length > 0 && (
        <div className="mt-auto border-t border-[--color-border] px-3 py-3">
          <button
            type="button"
            onClick={() => setShowOthers((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs font-medium text-[--color-text-muted] transition-colors hover:bg-[--color-surface-overlay]"
          >
            <span>其他 repos（無 milestone）</span>
            <ChevronRight
              size={14}
              strokeWidth={2}
              className={`transition-transform ${showOthers ? 'rotate-90' : ''}`}
            />
          </button>
          {showOthers && (
            <ul className="mt-1 flex flex-col gap-0.5">
              {withoutMilestones.map((repo) => (
                <li key={repo.name}>
                  <a
                    href={repo.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs text-[--color-text-secondary] transition-colors hover:bg-[--color-surface-overlay]"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      {repo.isPrivate && (
                        <Lock
                          size={10}
                          strokeWidth={2}
                          className="flex-shrink-0 text-[--color-text-muted]"
                        />
                      )}
                      <span className="truncate">{repo.name}</span>
                    </span>
                    <ExternalLink
                      size={12}
                      strokeWidth={2}
                      className="flex-shrink-0 text-[--color-text-muted]"
                    />
                  </a>
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
