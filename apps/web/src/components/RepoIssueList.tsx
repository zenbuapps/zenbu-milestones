import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleDot,
  Inbox,
  Milestone as RoadmapIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { IssueLite, RepoDetail } from 'shared';
import { formatTimeAgo } from '../utils/date';
import EmptyState from './EmptyState';
import IssueFilterBar, {
  textColorForBg,
  type TFilterQuery,
} from './IssueFilterBar';
import MarkdownPreview from './MarkdownPreview';

type TRepoIssueListProps = {
  /** 當前 repo 的完整 detail；`allIssues` 即為本元件的資料來源 */
  detail: RepoDetail;
};

/** 預設 filter 狀態：僅看 open issues、其餘全部放寬 */
const DEFAULT_QUERY: TFilterQuery = {
  keyword: '',
  state: 'open',
  labels: [],
  assignees: [],
  roadmapNumber: 'all',
};

/**
 * 若 label.color 不是合法 6 位 hex，回傳 undefined 讓呼叫端使用 fallback
 */
const toHexColor = (raw: string): string | undefined => {
  const normalized = raw.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return undefined;
  return normalized;
};

/**
 * 對不規則文字做 regex escape（避免 keyword 帶 regex meta character 時 crash）
 */
const escapeRegExp = (raw: string): string =>
  raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 某 repo 的完整 issue 列表 + 濾條
 * 資料來源：`detail.allIssues`（不自行 fetch）
 */
/** 每頁筆數選項（issue #16）*/
const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
type TPageSize = (typeof PAGE_SIZE_OPTIONS)[number];

const RepoIssueList = ({ detail }: TRepoIssueListProps) => {
  const [query, setQuery] = useState<TFilterQuery>(DEFAULT_QUERY);
  /** issue #16：分頁狀態（client-side；allIssues 已全載）*/
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<TPageSize>(20);

  /** 建立 issue number → roadmap number 的 map（issue 自己沒帶 roadmap 欄位） */
  const issueToRoadmap = useMemo<Map<number, number>>(() => {
    const map = new Map<number, number>();
    for (const m of detail.roadmaps) {
      for (const i of m.issues) {
        map.set(i.number, m.number);
      }
    }
    return map;
  }, [detail.roadmaps]);

  /** roadmap number → title 反查（用於列表顯示 roadmap 名稱） */
  const roadmapTitleByNumber = useMemo<Map<number, string>>(() => {
    const map = new Map<number, string>();
    for (const m of detail.roadmaps) {
      map.set(m.number, m.title);
    }
    return map;
  }, [detail.roadmaps]);

  /** 可用的 label 選項（去重；以 name 為 key） */
  const availableLabels = useMemo(() => {
    const seen = new Map<string, { name: string; color: string }>();
    for (const issue of detail.allIssues) {
      for (const label of issue.labels) {
        if (!seen.has(label.name)) {
          seen.set(label.name, { name: label.name, color: label.color });
        }
      }
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [detail.allIssues]);

  /** 可用的 assignee 選項（去重） */
  const availableAssignees = useMemo(() => {
    const seen = new Set<string>();
    for (const issue of detail.allIssues) {
      for (const login of issue.assignees) {
        seen.add(login);
      }
    }
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [detail.allIssues]);

  const availableRoadmaps = useMemo(
    () => detail.roadmaps.map((m) => ({ number: m.number, title: m.title })),
    [detail.roadmaps],
  );

  /** 依 query filter allIssues；空 keyword 與空陣列視為「不套用該 filter」 */
  const filtered = useMemo<IssueLite[]>(() => {
    const keyword = query.keyword.trim().toLowerCase();
    return detail.allIssues.filter((issue) => {
      // 狀態
      if (query.state !== 'all' && issue.state !== query.state) return false;

      // keyword（只搜 title；case-insensitive）
      if (keyword !== '' && !issue.title.toLowerCase().includes(keyword)) {
        return false;
      }

      // labels（AND）
      if (query.labels.length > 0) {
        const issueLabelNames = new Set(issue.labels.map((l) => l.name));
        for (const needed of query.labels) {
          if (!issueLabelNames.has(needed)) return false;
        }
      }

      // assignees（AND）
      if (query.assignees.length > 0) {
        const issueAssigneeSet = new Set(issue.assignees);
        for (const needed of query.assignees) {
          if (!issueAssigneeSet.has(needed)) return false;
        }
      }

      // roadmap
      if (query.roadmapNumber !== 'all') {
        const linked = issueToRoadmap.get(issue.number);
        if (query.roadmapNumber === 'none') {
          if (linked !== undefined) return false;
        } else if (linked !== query.roadmapNumber) {
          return false;
        }
      }

      return true;
    });
  }, [detail.allIssues, query, issueToRoadmap]);

  /** 各狀態計數（忽略 state filter，套用其餘 filter 後分別算） */
  const counts = useMemo(() => {
    const keyword = query.keyword.trim().toLowerCase();
    let open = 0;
    let closed = 0;

    for (const issue of detail.allIssues) {
      if (keyword !== '' && !issue.title.toLowerCase().includes(keyword)) continue;
      if (query.labels.length > 0) {
        const set = new Set(issue.labels.map((l) => l.name));
        if (!query.labels.every((n) => set.has(n))) continue;
      }
      if (query.assignees.length > 0) {
        const set = new Set(issue.assignees);
        if (!query.assignees.every((n) => set.has(n))) continue;
      }
      if (query.roadmapNumber !== 'all') {
        const linked = issueToRoadmap.get(issue.number);
        if (query.roadmapNumber === 'none') {
          if (linked !== undefined) continue;
        } else if (linked !== query.roadmapNumber) {
          continue;
        }
      }
      if (issue.state === 'open') open += 1;
      else closed += 1;
    }
    return { open, closed, all: open + closed };
  }, [detail.allIssues, query, issueToRoadmap]);

  const clearAll = (): void => setQuery(DEFAULT_QUERY);

  /** 整個 repo 沒有任何 issue 與套 filter 後為 0 是兩個不同情境，要給不同 EmptyState */
  const hasNoIssuesAtAll = detail.allIssues.length === 0;

  // 任一濾條 / pageSize 變動時把頁碼重設回 1，避免顯示空白頁
  // （filtered 引用穩定性已由上方 useMemo 控制；用 filtered.length 當依賴即可）
  const filteredCount = filtered.length;
  useEffect(() => {
    setPage(1);
  }, [filteredCount, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const sliceStart = (safePage - 1) * pageSize;
  const sliceEnd = sliceStart + pageSize;
  const visible = filtered.slice(sliceStart, sliceEnd);
  const rangeStart = filteredCount === 0 ? 0 : sliceStart + 1;
  const rangeEnd = Math.min(sliceEnd, filteredCount);

  return (
    <section aria-label="全部 Issues" className="mt-8">
      <header className="mb-4 flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-[--color-text-primary] sm:text-lg">
          全部 Issues
        </h2>
        <span className="text-xs text-[--color-text-muted]">
          共 {detail.allIssues.length} 筆
        </span>
      </header>

      {hasNoIssuesAtAll ? (
        <EmptyState
          icon={Inbox}
          title="此 repo 尚無任何 Issue"
          description="當有人在 GitHub 上對此 repo 開 issue 後，會自動出現在這裡。"
        />
      ) : (
        <>
          <IssueFilterBar
            availableLabels={availableLabels}
            availableAssignees={availableAssignees}
            availableRoadmaps={availableRoadmaps}
            counts={counts}
            query={query}
            onChange={setQuery}
          />

          {filteredCount === 0 ? (
            <EmptyState
              icon={Inbox}
              title="無符合條件的 Issue"
              description="試著放寬搜尋條件或清除所有濾條。"
              action={
                <button type="button" onClick={clearAll} className="btn-secondary">
                  清除所有濾條
                </button>
              }
            />
          ) : (
            <>
              <ul className="divide-y divide-[--color-border] overflow-hidden rounded-xl border border-[--color-border] bg-white">
                {visible.map((issue) => {
                  const linkedRoadmap = issueToRoadmap.get(issue.number);
                  const linkedTitle =
                    linkedRoadmap !== undefined
                      ? roadmapTitleByNumber.get(linkedRoadmap) ?? null
                      : null;
                  return (
                    <IssueRow
                      key={issue.number}
                      issue={issue}
                      keyword={query.keyword}
                      roadmapNumber={linkedRoadmap ?? null}
                      roadmapTitle={linkedTitle}
                    />
                  );
                })}
              </ul>

              <Pager
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                total={filteredCount}
                page={safePage}
                totalPages={totalPages}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(s) => setPageSize(s)}
              />
            </>
          )}
        </>
      )}
    </section>
  );
};

type TPagerProps = {
  rangeStart: number;
  rangeEnd: number;
  total: number;
  page: number;
  totalPages: number;
  pageSize: TPageSize;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: TPageSize) => void;
};

/**
 * Issue 列表分頁器（issue #16）
 * - 左：顯示「第 X-Y 筆 / 共 N 筆」與每頁筆數切換
 * - 右：上一頁 / 第 P / N 頁 / 下一頁
 * - 單頁時仍顯示，讓使用者看到每頁筆數切換鈕
 */
const Pager = ({
  rangeStart,
  rangeEnd,
  total,
  page,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: TPagerProps) => {
  const canPrev = page > 1;
  const canNext = page < totalPages;
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-xl border border-[--color-border] bg-white px-3 py-2 text-xs text-[--color-text-secondary] sm:flex-row sm:items-center sm:justify-between sm:px-4">
      <div className="flex items-center gap-3">
        <span>
          顯示第 <span className="font-semibold text-[--color-text-primary]">{rangeStart}</span>
          –<span className="font-semibold text-[--color-text-primary]">{rangeEnd}</span> 筆
          / 共 <span className="font-semibold text-[--color-text-primary]">{total}</span> 筆
        </span>
        <label className="inline-flex items-center gap-1">
          每頁
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value) as TPageSize)}
            className="rounded-md border border-[--color-border] bg-white px-1.5 py-0.5 text-xs text-[--color-text-primary] focus:border-[--color-brand] focus:outline-none focus:ring-2 focus:ring-[--color-brand-ring]"
            aria-label="每頁筆數"
          >
            {PAGE_SIZE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          筆
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={!canPrev}
          aria-label="上一頁"
          className="inline-flex items-center gap-1 rounded-md border border-[--color-border] px-2 py-1 text-xs font-medium text-[--color-text-secondary] hover:bg-[--color-surface-overlay] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronLeft size={12} strokeWidth={2.25} />
          上一頁
        </button>
        <span aria-live="polite">
          第 <span className="font-semibold text-[--color-text-primary]">{page}</span>
          / <span className="font-semibold text-[--color-text-primary]">{totalPages}</span> 頁
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={!canNext}
          aria-label="下一頁"
          className="inline-flex items-center gap-1 rounded-md border border-[--color-border] px-2 py-1 text-xs font-medium text-[--color-text-secondary] hover:bg-[--color-surface-overlay] disabled:cursor-not-allowed disabled:opacity-50"
        >
          下一頁
          <ChevronRight size={12} strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
};

type TIssueRowProps = {
  issue: IssueLite;
  keyword: string;
  roadmapNumber: number | null;
  roadmapTitle: string | null;
};

/**
 * 單列 issue：state icon + 標題（外連 GitHub）+ meta 列 + 可展開的 body
 */
const IssueRow = ({ issue, keyword, roadmapNumber, roadmapTitle }: TIssueRowProps) => {
  const [bodyExpanded, setBodyExpanded] = useState(false);

  return (
    <li className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[--color-surface-overlay] sm:px-5 sm:py-3.5">
      <span className="mt-0.5 flex-shrink-0">
        {issue.state === 'open' ? (
          <CircleDot size={16} strokeWidth={2.25} className="text-green-600" />
        ) : (
          <CheckCircle2 size={16} strokeWidth={2.25} className="text-purple-600" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <a
            href={issue.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-[--color-text-primary] hover:text-[--color-brand] hover:underline"
          >
            <HighlightedText text={issue.title} keyword={keyword} />
          </a>
          {issue.labels.map((label) => (
            <IssueLabel key={label.name} name={label.name} color={label.color} />
          ))}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[--color-text-muted]">
          <span className="font-mono">#{issue.number}</span>
          <span>
            {issue.state === 'open' ? '建立於' : '關閉於'}{' '}
            {formatTimeAgo(issue.closedAt ?? issue.createdAt)}
          </span>
          {roadmapNumber !== null && roadmapTitle !== null && (
            <span className="inline-flex items-center gap-1 text-[--color-text-secondary]">
              <RoadmapIcon size={12} strokeWidth={2.25} />
              {roadmapTitle}
            </span>
          )}
          {issue.assignees.length > 0 && (
            <span className="flex items-center gap-1">
              <span className="flex -space-x-1.5">
                {issue.assignees.slice(0, 3).map((login) => (
                  <img
                    key={login}
                    src={`https://github.com/${login}.png?size=24`}
                    alt={login}
                    title={login}
                    className="h-4 w-4 rounded-full border border-white bg-[--color-surface-overlay]"
                  />
                ))}
              </span>
              {issue.assignees.length > 3 && (
                <span>+{issue.assignees.length - 3}</span>
              )}
            </span>
          )}
        </div>

        <IssueBody
          body={issue.body}
          expanded={bodyExpanded}
          onToggle={() => setBodyExpanded((v) => !v)}
        />
      </div>
    </li>
  );
};

type TIssueBodyProps = {
  body: string | null;
  expanded: boolean;
  onToggle: () => void;
};

/**
 * Issue body 顯示區：完全不做預覽，預設收合（隱藏 body）
 * - body 為 null 或全空白：不渲染（連 toggle 也沒有）
 * - body 有內容：預設只顯示「展開內容」按鈕；展開後才渲染 markdown 並切為「收合內容」
 */
const IssueBody = ({ body, expanded, onToggle }: TIssueBodyProps) => {
  if (body === null || body.trim() === '') return null;
  return (
    <div className="mt-2">
      {expanded && (
        <div className="rounded-md bg-[--color-surface] px-3 py-2 text-xs text-[--color-text-secondary]">
          <MarkdownPreview source={body} />
        </div>
      )}
      <button
        type="button"
        onClick={onToggle}
        className={
          'inline-flex items-center gap-1 text-[11px] font-medium text-[--color-brand] hover:underline ' +
          (expanded ? 'mt-1.5' : '')
        }
        aria-expanded={expanded}
      >
        {expanded ? (
          <>
            <ChevronUp size={12} strokeWidth={2.25} />
            收合內容
          </>
        ) : (
          <>
            <ChevronDown size={12} strokeWidth={2.25} />
            展開內容
          </>
        )}
      </button>
    </div>
  );
};

type TIssueLabelProps = {
  name: string;
  color: string;
};

const IssueLabel = ({ name, color }: TIssueLabelProps) => {
  const hex = toHexColor(color);
  if (!hex) {
    return (
      <span className="inline-flex items-center rounded-full bg-[--color-surface-overlay] px-2 py-0.5 text-[10px] font-medium text-[--color-text-muted]">
        {name}
      </span>
    );
  }
  const fg = textColorForBg(hex);
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: `#${hex}`, color: fg }}
    >
      {name}
    </span>
  );
};

type THighlightedTextProps = {
  text: string;
  keyword: string;
};

/**
 * 在 text 中標示 keyword 命中（大小寫不敏感）
 * - keyword 為空 → 原樣輸出
 * - 若 regex 建不起來（極端 escape 問題），fallback 原文
 */
const HighlightedText = ({ text, keyword }: THighlightedTextProps) => {
  const needle = keyword.trim();
  if (needle === '') return <>{text}</>;

  try {
    const needleLower = needle.toLowerCase();
    const re = new RegExp(`(${escapeRegExp(needle)})`, 'ig');
    const parts = text.split(re);
    return (
      <>
        {parts.map((part, idx) =>
          part.toLowerCase() === needleLower ? (
            <mark
              key={idx}
              className="rounded bg-yellow-200 px-0.5 text-[--color-text-primary]"
            >
              {part}
            </mark>
          ) : (
            <span key={idx}>{part}</span>
          ),
        )}
      </>
    );
  } catch {
    return <>{text}</>;
  }
};

export default RepoIssueList;
