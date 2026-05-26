import {
  ArrowRight,
  CircleDot,
  ExternalLink,
  FolderGit2,
  Inbox,
  Search,
  ShieldCheck,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';
import type { AdminIssueRow, Summary } from 'shared';
import { fetchAdminIssues } from '../data/api';

/** Sidebar 與整個專案共用：目前所有 repo 預設 owner */
const DEFAULT_OWNER = 'zenbuapps';

/** 單一搜尋結果的扁平形狀（鍵盤導航以 flatten 後的 index 為準）*/
type TResult = {
  /** React key、唯一 */
  key: string;
  group: 'repo' | 'issue' | 'pending';
  /** icon 元件（lucide-react）*/
  icon: typeof FolderGit2;
  /** icon 容器底色 / 字色 class */
  iconClass: string;
  /** 主要文字（粗體顯示）*/
  title: string;
  /** 副標（小字、淡色，meta / repo / 編號等）*/
  meta: string;
  /** 觸發動作（選擇 / Enter / 點擊）*/
  onSelect: () => void;
  /** Enter / Click 後外部開啟（GitHub）時要顯示的 hint icon */
  external?: boolean;
};

type TGroup = {
  group: TResult['group'];
  label: string;
  /** group 旁邊的小字註解（可選，例如「顯示最近活躍的 issue」）*/
  hint?: string;
  items: TResult[];
};

type TCommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  summary: Summary;
  hiddenRepos: Set<string>;
  isAdmin: boolean;
};

/** 命中：純 substring、case-insensitive、空字串視為全部命中（讓使用者剛打開就看到清單）*/
const matches = (haystack: string, needle: string): boolean => {
  if (needle === '') return true;
  return haystack.toLowerCase().includes(needle.toLowerCase());
};

/** 一次抽出 group 用的 ↑ index helper，避免 render 內到處重複算 */
const flattenedIndex = (groups: TGroup[]): TResult[] =>
  groups.flatMap((g) => g.items);

/**
 * 全域命令面板（Ctrl + K / Cmd + K，issue #35）
 *
 * 設計：
 * - 三個群組分組顯示，符合 issue 規格：Repos / GitHub Issues / 待審核 Issues（admin 限定）
 * - 鍵盤導航：↑ ↓ Enter Esc；query / 群組變動時 activeIndex 重置為 0
 * - 待審核 issue 採 lazy fetch：第一次打開面板才打 `/api/admin/issues?status=pending`，
 *   結果於同一 session 內快取於 component state，避免每次 Cmd+K 都打一次 API；
 *   client-side 再 filter 一次 `status === 'pending'`（issue #36，defense-in-depth）
 * - GitHub Issue 來源為 summary 已載入的 `oldestOpenIssues`（issue #36：不再合併
 *   `recentClosedIssues`，K bar 不曝光已 closed 的 issue）；列表 header 附 hint 告知範圍
 * - 選中 repo / pending → 在當前分頁路由切換；GitHub issue → 另開分頁到 github.com
 * - z-index 100，蓋過 TopNav（z-50）與 sidebar drawer（z-30/40）
 */
const CommandPalette = ({
  open,
  onClose,
  summary,
  hiddenRepos,
  isAdmin,
}: TCommandPaletteProps) => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const titleId = useId();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  /** 待審核 issue 資料；null = 尚未拉、[] = 拉過但空 */
  const [pendingIssues, setPendingIssues] = useState<AdminIssueRow[] | null>(null);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [isLoadingPending, setIsLoadingPending] = useState(false);

  /** 打開時：reset query、focus、lock body scroll */
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    // 推遲一格 tick 等 input 進入 DOM 後再 focus
    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.cancelAnimationFrame(id);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  /** 第一次打開且為 admin → lazy fetch 待審核 issue */
  useEffect(() => {
    if (!open || !isAdmin) return;
    if (pendingIssues !== null || isLoadingPending) return;
    setIsLoadingPending(true);
    setPendingError(null);
    fetchAdminIssues('pending')
      .then((rows) => {
        setPendingIssues(rows);
      })
      .catch((err) => {
        // 非 admin 會 403，但這分支只在 isAdmin 為 true 時跑，所以多半是網路 / server 問題
        const msg = err instanceof Error ? err.message : '載入待審核 issue 失敗';
        setPendingError(msg);
        setPendingIssues([]); // 避免無限重試
      })
      .finally(() => setIsLoadingPending(false));
  }, [open, isAdmin, pendingIssues, isLoadingPending]);

  /** Repos 結果（過濾隱藏 repo）*/
  const repoResults = useMemo<TResult[]>(() => {
    return summary.repos
      .filter((r) => !hiddenRepos.has(r.name))
      .filter(
        (r) =>
          matches(r.name, query) || matches(r.description ?? '', query),
      )
      .slice(0, 12) // 過多無意義；限制每組 12 筆
      .map((r) => ({
        key: `repo:${r.name}`,
        group: 'repo',
        icon: FolderGit2,
        iconClass: 'bg-[--color-primary-50] text-[--color-brand]',
        title: r.name,
        meta:
          r.description?.trim() ||
          `${r.openIssues} open · ${r.roadmapCount} roadmap`,
        onSelect: () => {
          navigate(`/repo/${r.name}`);
          onClose();
        },
      }));
  }, [summary.repos, hiddenRepos, query, navigate, onClose]);

  /**
   * GitHub issues 結果（來自 summary 已載入的目前 open issue，跨 repo）
   *
   * issue #36：K bar 不應出現「已 closed」的 issue —— 故只取 `oldestOpenIssues`，
   * 不再合併 `recentClosedIssues`；並再加一次 `i.state === 'open'` 防呆，
   * 即便上游資料源誤帶 closed 進來也擋下，避免 UI 偷偷漏出已關閉 issue。
   */
  const issueResults = useMemo<TResult[]>(() => {
    const seen = new Set<string>();
    return summary.oldestOpenIssues
      .filter((i) => i.state === 'open') // issue #36：client-side defense-in-depth
      .filter((i) => !hiddenRepos.has(i.repoName))
      .filter((i) => {
        const k = `${i.repoOwner}/${i.repoName}#${i.number}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .filter(
        (i) =>
          matches(i.title, query) ||
          matches(i.repoName, query) ||
          matches(`#${i.number}`, query),
      )
      .slice(0, 10)
      .map((i) => ({
        key: `issue:${i.repoOwner}/${i.repoName}#${i.number}`,
        group: 'issue',
        icon: CircleDot,
        iconClass: 'bg-green-50 text-green-600',
        title: i.title,
        meta: `${i.repoName} · #${i.number} · open`,
        onSelect: () => {
          window.open(i.htmlUrl, '_blank', 'noopener,noreferrer');
          onClose();
        },
        external: true,
      }));
  }, [summary.oldestOpenIssues, hiddenRepos, query, onClose]);

  /**
   * 待審核 issues（admin only）
   *
   * issue #36：後端 `listAll('pending')` 雖已 filter 到 `status=pending`，但 K bar 不該
   * 漏出 `rejected` / `approved` / `synced-to-github` 任一狀態。此處加 client-side
   * defense-in-depth filter，萬一 fetch 參數誤改成 'all' 或 server 邏輯回歸，
   * UI 仍只會顯示真正待審核的 issue。
   */
  const pendingResults = useMemo<TResult[]>(() => {
    if (!isAdmin || !pendingIssues) return [];
    return pendingIssues
      .filter((i) => i.status === 'pending') // issue #36：client-side defense-in-depth
      .filter(
        (i) =>
          matches(i.title, query) ||
          matches(i.repoName, query) ||
          matches(i.author.displayName, query),
      )
      .slice(0, 10)
      .map((i) => ({
        key: `pending:${i.id}`,
        group: 'pending',
        icon: ShieldCheck,
        iconClass: 'bg-orange-50 text-orange-500',
        title: i.title,
        meta: `${i.repoName} · 由 ${i.author.displayName} 投稿`,
        onSelect: () => {
          // AdminPage 預設進入「待審核 Issue」分頁；目前不支援深連結到單筆 id，
          // 跳到 admin 頁讓使用者直接在審核表格找到對應列
          navigate('/admin');
          onClose();
        },
      }));
  }, [isAdmin, pendingIssues, query, navigate, onClose]);

  const groups = useMemo<TGroup[]>(() => {
    const out: TGroup[] = [];
    if (repoResults.length > 0) {
      out.push({ group: 'repo', label: 'Repos', items: repoResults });
    }
    if (issueResults.length > 0) {
      out.push({
        group: 'issue',
        label: 'GitHub Issues',
        hint: '目前 open 中、跨 repo 依建立時間最舊優先', // issue #36：移除 closed 後的範圍說明
        items: issueResults,
      });
    }
    if (isAdmin && pendingResults.length > 0) {
      out.push({
        group: 'pending',
        label: '待審核 Issues',
        items: pendingResults,
      });
    }
    return out;
  }, [repoResults, issueResults, pendingResults, isAdmin]);

  /** 鍵盤導航用的 flatten 結果 */
  const flat = useMemo(() => flattenedIndex(groups), [groups]);

  /** query / 結果集變動時 reset activeIndex（避免指向已不存在的列）*/
  useEffect(() => {
    setActiveIndex(0);
  }, [query, flat.length]);

  /** 將 activeIndex 對應到的 TResult 抽出來，方便 Enter 取用 */
  const active = flat[activeIndex] ?? null;

  /** Esc / ↑↓ / Enter 鍵盤處理（在 panel 上以 onKeyDown 攔截，避免 input 把 Esc 吃掉）*/
  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (flat.length === 0) return;
        setActiveIndex((i) => (i + 1) % flat.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (flat.length === 0) return;
        setActiveIndex((i) => (i - 1 + flat.length) % flat.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        active?.onSelect();
      }
    },
    [active, flat.length, onClose],
  );

  /** 結果列被 hover 時同步 activeIndex；mouse 與 keyboard 體驗一致 */
  const onMouseEnterIndex = useCallback((idx: number) => {
    setActiveIndex(idx);
  }, []);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[100] flex items-start justify-center px-3 pt-[12vh] sm:pt-[15vh]"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="關閉命令面板"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/40"
        tabIndex={-1}
      />

      {/* Panel */}
      <div className="relative w-full max-w-2xl overflow-hidden rounded-xl border border-[--color-border] bg-white shadow-2xl">
        {/* Search input */}
        <div className="flex items-center gap-2 border-b border-[--color-border] px-4 py-3">
          <Search size={16} strokeWidth={2} className="text-[--color-text-muted]" />
          <input
            ref={inputRef}
            id={titleId}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋 repo、issue 或待審核投稿…"
            aria-label="全域搜尋"
            className="flex-1 bg-transparent text-sm text-[--color-text-primary] placeholder:text-[--color-text-muted] focus:outline-none"
          />
          <kbd className="hidden rounded border border-[--color-border] bg-[--color-surface] px-1.5 py-0.5 text-[10px] font-medium text-[--color-text-muted] sm:inline">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {groups.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-[--color-text-muted]">
              {isLoadingPending ? (
                <span>載入中…</span>
              ) : query.trim() === '' ? (
                <span>輸入關鍵字以搜尋</span>
              ) : (
                <span>沒有找到符合「{query}」的結果</span>
              )}
            </div>
          )}

          {groups.map((g) => {
            // 計算這個 group 第一個 item 在 flat 中的 offset，用來判斷某 row 是否 active
            const firstFlatIndex = flat.findIndex((r) => r.key === g.items[0]!.key);
            return (
              <div key={g.group} className="mb-1 last:mb-0">
                <div className="flex items-center justify-between px-4 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-[--color-text-muted]">
                  <span>
                    {g.label}
                    <span className="ml-1.5 normal-case tracking-normal text-[--color-text-muted]">
                      ({g.items.length})
                    </span>
                  </span>
                  {g.hint && (
                    <span className="normal-case tracking-normal text-[--color-text-muted]">
                      {g.hint}
                    </span>
                  )}
                </div>
                <ul role="listbox" aria-label={g.label}>
                  {g.items.map((item, i) => {
                    const idx = firstFlatIndex + i;
                    const isActive = idx === activeIndex;
                    const Icon = item.icon;
                    return (
                      <li
                        key={item.key}
                        role="option"
                        aria-selected={isActive}
                      >
                        <button
                          type="button"
                          onMouseEnter={() => onMouseEnterIndex(idx)}
                          onClick={item.onSelect}
                          className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
                            isActive
                              ? 'bg-[--color-primary-50]'
                              : 'hover:bg-[--color-surface]'
                          }`}
                        >
                          <span
                            className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded ${item.iconClass}`}
                          >
                            <Icon size={14} strokeWidth={2.25} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-[--color-text-primary]">
                              {item.title}
                            </span>
                            <span className="block truncate text-xs text-[--color-text-muted]">
                              {item.meta}
                            </span>
                          </span>
                          {item.external ? (
                            <ExternalLink
                              size={14}
                              strokeWidth={2}
                              className="flex-shrink-0 text-[--color-text-muted]"
                            />
                          ) : (
                            <ArrowRight
                              size={14}
                              strokeWidth={2}
                              className={`flex-shrink-0 ${
                                isActive
                                  ? 'text-[--color-brand]'
                                  : 'text-[--color-text-muted]'
                              }`}
                            />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}

          {pendingError && isAdmin && (
            <div className="mx-4 mt-2 rounded border border-[--color-border] bg-[--color-surface] px-3 py-2 text-xs text-[--color-text-muted]">
              <Inbox size={12} className="mr-1 inline" strokeWidth={2.25} />
              待審核 issue 載入失敗：{pendingError}
            </div>
          )}
        </div>

        {/* Footer / hint bar */}
        <div className="flex items-center justify-between border-t border-[--color-border] bg-[--color-surface] px-4 py-2 text-[11px] text-[--color-text-muted]">
          <span className="flex items-center gap-3">
            <span>
              <kbd className="rounded border border-[--color-border] bg-white px-1 py-0.5 font-medium">
                ↑
              </kbd>
              <kbd className="ml-0.5 rounded border border-[--color-border] bg-white px-1 py-0.5 font-medium">
                ↓
              </kbd>
              <span className="ml-1.5">移動</span>
            </span>
            <span>
              <kbd className="rounded border border-[--color-border] bg-white px-1 py-0.5 font-medium">
                Enter
              </kbd>
              <span className="ml-1.5">選擇</span>
            </span>
          </span>
          <span className="hidden sm:inline">
            owner = <span className="font-medium">{DEFAULT_OWNER}</span>
          </span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
