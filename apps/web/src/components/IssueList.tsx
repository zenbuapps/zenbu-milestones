import { CheckCircle2, CircleDot } from 'lucide-react';
import type { IssueLite } from 'shared';

type TIssueListProps = {
  issues: IssueLite[];
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
 * Milestone 展開後顯示的 issue 清單
 * 每列：state icon + #number + title + labels + assignees avatars
 */
const IssueList = ({ issues }: TIssueListProps) => {
  if (issues.length === 0) {
    return (
      <div className="mt-3 border-l-2 border-[--color-border] pl-4 text-xs text-[--color-text-muted]">
        此 milestone 尚未有任何 issue
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-1 border-l-2 border-[--color-border] pl-4">
      {issues.map((issue) => (
        <a
          key={issue.number}
          href={issue.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="-mx-2 flex items-start gap-2 rounded px-2 py-1.5 hover:bg-[--color-surface-overlay]"
        >
          <span className="mt-0.5 flex-shrink-0">
            {issue.state === 'open' ? (
              <CircleDot size={14} strokeWidth={2.25} className="text-green-600" />
            ) : (
              <CheckCircle2
                size={14}
                strokeWidth={2.25}
                className="text-[--color-text-muted]"
              />
            )}
          </span>

          <span className="flex-shrink-0 font-mono text-xs text-[--color-text-muted]">
            #{issue.number}
          </span>

          <span className="min-w-0 flex-1 truncate text-sm text-[--color-text-secondary]">
            {issue.title}
          </span>

          {issue.labels.slice(0, 3).map((label) => {
            const hex = toHexColor(label.color);
            const style = hex
              ? {
                  backgroundColor: `#${hex}20`,
                  color: `#${hex}`,
                }
              : undefined;
            return (
              <span
                key={label.name}
                className={
                  'flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ' +
                  (style ? '' : 'bg-[--color-surface-overlay] text-[--color-text-muted]')
                }
                style={style}
              >
                {label.name}
              </span>
            );
          })}

          {issue.assignees.length > 0 && (
            <span className="flex flex-shrink-0 -space-x-1.5">
              {issue.assignees.slice(0, 3).map((login) => (
                <img
                  key={login}
                  src={`https://github.com/${login}.png?size=24`}
                  alt={login}
                  title={login}
                  className="h-5 w-5 rounded-full border border-white bg-[--color-surface-overlay]"
                />
              ))}
            </span>
          )}
        </a>
      ))}
    </div>
  );
};

export default IssueList;
