import { CheckCircle2, CircleDot, Inbox, Milestone as MilestoneIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { IssueLite, RepoDetail } from '../data/types';
import { formatTimeAgo } from '../utils/date';
import EmptyState from './EmptyState';
import IssueFilterBar, {
  textColorForBg,
  type TFilterQuery,
} from './IssueFilterBar';

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
  milestoneNumber: 'all',
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
const RepoIssueList = ({ detail }: TRepoIssueListProps) => {
  const [query, setQuery] = useState<TFilterQuery>(DEFAULT_QUERY);

  /** 建立 issue number → milestone number 的 map（issue 自己沒帶 milestone 欄位） */
  const issueToMilestone = useMemo<Map<number, number>>(() => {
    const map = new Map<number, number>();
    for (const m of detail.milestones) {
      for (const i of m.issues) {
        map.set(i.number, m.number);
      }
    }
    return map;
  }, [detail.milestones]);

  /** milestone number → title 反查（用於列表顯示 milestone 名稱） */
  const milestoneTitleByNumber = useMemo<Map<number, string>>(() => {
    const map = new Map<number, string>();
    for (const m of detail.milestones) {
      map.set(m.number, m.title);
    }
    return map;
  }, [detail.milestones]);

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

  const availableMilestones = useMemo(
    () => detail.milestones.map((m) => ({ number: m.number, title: m.title })),
    [detail.milestones],
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

      // milestone
      if (query.milestoneNumber !== 'all') {
        const linked = issueToMilestone.get(issue.number);
        if (query.milestoneNumber === 'none') {
          if (linked !== undefined) return false;
        } else if (linked !== query.milestoneNumber) {
          return false;
        }
      }

      return true;
    });
  }, [detail.allIssues, query, issueToMilestone]);

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
      if (query.milestoneNumber !== 'all') {
        const linked = issueToMilestone.get(issue.number);
        if (query.milestoneNumber === 'none') {
          if (linked !== undefined) continue;
        } else if (linked !== query.milestoneNumber) {
          continue;
        }
      }
      if (issue.state === 'open') open += 1;
      else closed += 1;
    }
    return { open, closed, all: open + closed };
  }, [detail.allIssues, query, issueToMilestone]);

  const clearAll = (): void => setQuery(DEFAULT_QUERY);

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

      <IssueFilterBar
        availableLabels={availableLabels}
        availableAssignees={availableAssignees}
        availableMilestones={availableMilestones}
        counts={counts}
        query={query}
        onChange={setQuery}
      />

      {filtered.length === 0 ? (
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
        <ul className="divide-y divide-[--color-border] overflow-hidden rounded-xl border border-[--color-border] bg-white">
          {filtered.map((issue) => {
            const linkedMilestone = issueToMilestone.get(issue.number);
            const linkedTitle =
              linkedMilestone !== undefined
                ? milestoneTitleByNumber.get(linkedMilestone) ?? null
                : null;
            return (
              <IssueRow
                key={issue.number}
                issue={issue}
                keyword={query.keyword}
                milestoneNumber={linkedMilestone ?? null}
                milestoneTitle={linkedTitle}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
};

type TIssueRowProps = {
  issue: IssueLite;
  keyword: string;
  milestoneNumber: number | null;
  milestoneTitle: string | null;
};

/**
 * 單列 issue：state icon + 標題（外連 GitHub）+ meta 列
 */
const IssueRow = ({ issue, keyword, milestoneNumber, milestoneTitle }: TIssueRowProps) => (
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
        {milestoneNumber !== null && milestoneTitle !== null && (
          <span className="inline-flex items-center gap-1 text-[--color-text-secondary]">
            <MilestoneIcon size={12} strokeWidth={2.25} />
            {milestoneTitle}
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
    </div>
  </li>
);

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
