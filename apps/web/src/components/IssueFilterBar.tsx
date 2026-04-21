import {
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Inbox,
  Milestone as MilestoneIcon,
  Search,
  Tag,
  User,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export type TFilterState = 'open' | 'closed' | 'all';

export type TMilestoneFilter = number | 'all' | 'none';

/**
 * Filter query 狀態
 * - `keyword`：搜尋標題（client-side，大小寫不敏感）
 * - `state`：open / closed / all
 * - `labels`：已選 label name 陣列（AND 關係；issue 需擁有全部所選 label）
 * - `assignees`：已選 GitHub login 陣列（AND 關係）
 * - `milestoneNumber`：
 *   - `'all'`：不限 milestone
 *   - `'none'`：只顯示未排程（不在任何 milestone 內）
 *   - `number`：指定 milestone number
 */
export type TFilterQuery = {
  keyword: string;
  state: TFilterState;
  labels: string[];
  assignees: string[];
  milestoneNumber: TMilestoneFilter;
};

type TAvailableLabel = { name: string; color: string };

type TAvailableMilestone = { number: number; title: string };

export type TIssueFilterBarProps = {
  /** 當前 repo 所有 issue 去重後的 label 選項 */
  availableLabels: TAvailableLabel[];
  /** 當前 repo 所有 issue 去重後的 assignee login 選項 */
  availableAssignees: string[];
  /** 當前 repo 所有 milestones 選項（由父層取 detail.milestones） */
  availableMilestones: TAvailableMilestone[];
  /** 各狀態計數（用於 segmented tab 顯示）*/
  counts: { open: number; closed: number; all: number };
  /** 當前 filter 狀態（controlled） */
  query: TFilterQuery;
  /** 狀態變更回呼 */
  onChange: (next: TFilterQuery) => void;
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
 * 根據背景 hex 亮度決定前景文字色
 * （避免深色 label 背景搭配黑字導致不可讀）
 */
const textColorForBg = (hex: string): 'white' | 'black' => {
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.5 ? 'black' : 'white';
};

/** 判斷是否有任何 filter 處於非預設狀態（用於顯示「清除全部」） */
const hasActiveFilters = (q: TFilterQuery): boolean =>
  q.keyword.trim() !== '' ||
  q.state !== 'open' ||
  q.labels.length > 0 ||
  q.assignees.length > 0 ||
  q.milestoneNumber !== 'all';

const STATE_TABS: { value: TFilterState; label: string; icon: typeof CircleDot }[] = [
  { value: 'open', label: 'Open', icon: CircleDot },
  { value: 'closed', label: 'Closed', icon: CheckCircle2 },
  { value: 'all', label: '全部', icon: Inbox },
];

/**
 * Issue 列表濾條工具列
 * 橫向排列；mobile 下會折行。狀態以 segmented tab、其餘濾條以 dropdown。
 */
const IssueFilterBar = ({
  availableLabels,
  availableAssignees,
  availableMilestones,
  counts,
  query,
  onChange,
}: TIssueFilterBarProps) => {
  const active = hasActiveFilters(query);

  const handleKeyword = (keyword: string): void => {
    onChange({ ...query, keyword });
  };

  const handleState = (state: TFilterState): void => {
    onChange({ ...query, state });
  };

  const handleLabels = (labels: string[]): void => {
    onChange({ ...query, labels });
  };

  const handleAssignees = (assignees: string[]): void => {
    onChange({ ...query, assignees });
  };

  const handleMilestone = (milestoneNumber: TMilestoneFilter): void => {
    onChange({ ...query, milestoneNumber });
  };

  const clearAll = (): void => {
    onChange({
      keyword: '',
      state: 'open',
      labels: [],
      assignees: [],
      milestoneNumber: 'all',
    });
  };

  return (
    <div className="mb-4 flex flex-col gap-3">
      {/* 第一排：關鍵字 + 狀態 tab + 清除 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search
            size={14}
            strokeWidth={2}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[--color-text-muted]"
          />
          <input
            type="text"
            value={query.keyword}
            onChange={(e) => handleKeyword(e.target.value)}
            placeholder="搜尋標題..."
            className="input pl-8 text-xs"
            aria-label="搜尋 issue 標題"
          />
          {query.keyword !== '' && (
            <button
              type="button"
              onClick={() => handleKeyword('')}
              aria-label="清除搜尋"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[--color-text-muted] hover:bg-[--color-surface-overlay] hover:text-[--color-text-secondary]"
            >
              <X size={12} strokeWidth={2.25} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-[--color-surface-overlay] p-1">
            {STATE_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = query.state === tab.value;
              const count = counts[tab.value];
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => handleState(tab.value)}
                  aria-pressed={isActive}
                  className={
                    'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ' +
                    (isActive
                      ? 'bg-white text-[--color-brand] shadow-sm'
                      : 'text-[--color-text-secondary] hover:text-[--color-text-primary]')
                  }
                >
                  <Icon size={12} strokeWidth={2.25} />
                  {tab.label}
                  <span
                    className={
                      'rounded-full px-1.5 py-0.5 text-[10px] font-semibold ' +
                      (isActive
                        ? 'bg-[--color-primary-50] text-[--color-brand]'
                        : 'bg-white text-[--color-text-muted]')
                    }
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 第二排：dropdown filters */}
      <div className="flex flex-wrap items-center gap-2">
        <LabelDropdown
          options={availableLabels}
          selected={query.labels}
          onChange={handleLabels}
        />
        <MilestoneDropdown
          options={availableMilestones}
          selected={query.milestoneNumber}
          onChange={handleMilestone}
        />
        <AssigneeDropdown
          options={availableAssignees}
          selected={query.assignees}
          onChange={handleAssignees}
        />

        {active && (
          <button
            type="button"
            onClick={clearAll}
            className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-[--color-text-muted] underline-offset-2 hover:text-[--color-brand] hover:underline"
          >
            <X size={12} strokeWidth={2.25} />
            清除所有濾條
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * Hook：點擊元素外部時呼叫 callback（用於關閉 dropdown）
 */
const useClickOutside = (
  ref: React.RefObject<HTMLElement>,
  onOutside: () => void,
  enabled: boolean,
): void => {
  useEffect(() => {
    if (!enabled) return undefined;
    const handler = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) {
        onOutside();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, onOutside, enabled]);
};

type TDropdownShellProps = {
  triggerIcon: typeof Tag;
  triggerLabel: string;
  triggerBadge?: number;
  panelLabel: string;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: React.ReactNode;
};

/**
 * Dropdown 共用外殼：負責 trigger button、panel 定位、外部點擊關閉
 */
const DropdownShell = ({
  triggerIcon: TriggerIcon,
  triggerLabel,
  triggerBadge,
  panelLabel,
  isOpen,
  onToggle,
  onClose,
  children,
}: TDropdownShellProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  useClickOutside(containerRef, onClose, isOpen);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className={
          'inline-flex max-w-[240px] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ' +
          (triggerBadge && triggerBadge > 0
            ? 'border-[--color-brand] bg-[--color-primary-50] text-[--color-brand]'
            : 'border-[--color-border] bg-white text-[--color-text-secondary] hover:bg-[--color-surface-overlay]')
        }
      >
        <TriggerIcon size={12} strokeWidth={2.25} className="flex-shrink-0" />
        <span className="truncate">{triggerLabel}</span>
        {triggerBadge !== undefined && triggerBadge > 0 && (
          <span className="inline-flex h-4 min-w-4 flex-shrink-0 items-center justify-center rounded-full bg-[--color-brand] px-1 text-[10px] font-semibold text-white">
            {triggerBadge}
          </span>
        )}
        <ChevronDown size={12} strokeWidth={2.25} className="flex-shrink-0" />
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label={panelLabel}
          className="absolute left-0 top-full z-20 mt-1 w-64 max-h-80 overflow-y-auto rounded-lg border border-[--color-border] bg-white py-1 shadow-lg"
        >
          {children}
        </div>
      )}
    </div>
  );
};

type TLabelDropdownProps = {
  options: TAvailableLabel[];
  selected: string[];
  onChange: (next: string[]) => void;
};

/**
 * Label 多選下拉
 */
const LabelDropdown = ({ options, selected, onChange }: TLabelDropdownProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggle = (name: string): void => {
    if (selected.includes(name)) {
      onChange(selected.filter((n) => n !== name));
    } else {
      onChange([...selected, name]);
    }
  };

  return (
    <DropdownShell
      triggerIcon={Tag}
      triggerLabel="Label"
      triggerBadge={selected.length}
      panelLabel="選擇 label"
      isOpen={isOpen}
      onToggle={() => setIsOpen((v) => !v)}
      onClose={() => setIsOpen(false)}
    >
      {options.length === 0 ? (
        <div className="px-3 py-2 text-xs text-[--color-text-muted]">
          此 repo 沒有任何 label
        </div>
      ) : (
        <ul className="text-xs">
          {options.map((option) => {
            const isChecked = selected.includes(option.name);
            const hex = toHexColor(option.color);
            return (
              <li key={option.name}>
                <button
                  type="button"
                  onClick={() => toggle(option.name)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[--color-surface-overlay]"
                >
                  <span className="flex h-4 w-4 items-center justify-center">
                    {isChecked && (
                      <Check size={12} strokeWidth={2.5} className="text-[--color-brand]" />
                    )}
                  </span>
                  {hex ? (
                    <span
                      className="inline-block h-3 w-3 flex-shrink-0 rounded-sm"
                      style={{ backgroundColor: `#${hex}` }}
                    />
                  ) : (
                    <span className="inline-block h-3 w-3 flex-shrink-0 rounded-sm bg-[--color-surface-overlay]" />
                  )}
                  <span className="truncate text-[--color-text-primary]">
                    {option.name}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </DropdownShell>
  );
};

type TMilestoneDropdownProps = {
  options: TAvailableMilestone[];
  selected: TMilestoneFilter;
  onChange: (next: TMilestoneFilter) => void;
};

/**
 * Milestone 單選下拉（含「全部」「未排程」兩個特殊選項）
 */
const MilestoneDropdown = ({ options, selected, onChange }: TMilestoneDropdownProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const currentLabel = (() => {
    if (selected === 'all') return 'Milestone';
    if (selected === 'none') return '未排程';
    const found = options.find((m) => m.number === selected);
    return found ? `#${found.number} ${found.title}` : 'Milestone';
  })();

  const badge = selected === 'all' ? 0 : 1;

  const pick = (value: TMilestoneFilter): void => {
    onChange(value);
    setIsOpen(false);
  };

  return (
    <DropdownShell
      triggerIcon={MilestoneIcon}
      triggerLabel={currentLabel}
      triggerBadge={badge}
      panelLabel="選擇 milestone"
      isOpen={isOpen}
      onToggle={() => setIsOpen((v) => !v)}
      onClose={() => setIsOpen(false)}
    >
      <ul className="text-xs">
        <MilestoneItem
          label="全部"
          isSelected={selected === 'all'}
          onClick={() => pick('all')}
        />
        <MilestoneItem
          label="未排程"
          isSelected={selected === 'none'}
          onClick={() => pick('none')}
        />
        {options.length > 0 && (
          <li
            aria-hidden="true"
            className="my-1 border-t border-[--color-border]"
          />
        )}
        {options.map((m) => (
          <MilestoneItem
            key={m.number}
            label={`#${m.number} ${m.title}`}
            isSelected={selected === m.number}
            onClick={() => pick(m.number)}
          />
        ))}
      </ul>
    </DropdownShell>
  );
};

type TMilestoneItemProps = {
  label: string;
  isSelected: boolean;
  onClick: () => void;
};

const MilestoneItem = ({ label, isSelected, onClick }: TMilestoneItemProps) => (
  <li>
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[--color-surface-overlay]"
    >
      <span className="flex h-4 w-4 items-center justify-center">
        {isSelected && (
          <Check size={12} strokeWidth={2.5} className="text-[--color-brand]" />
        )}
      </span>
      <span className="truncate text-[--color-text-primary]">{label}</span>
    </button>
  </li>
);

type TAssigneeDropdownProps = {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
};

/**
 * Assignee 多選下拉
 */
const AssigneeDropdown = ({ options, selected, onChange }: TAssigneeDropdownProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggle = (login: string): void => {
    if (selected.includes(login)) {
      onChange(selected.filter((n) => n !== login));
    } else {
      onChange([...selected, login]);
    }
  };

  return (
    <DropdownShell
      triggerIcon={User}
      triggerLabel="Assignee"
      triggerBadge={selected.length}
      panelLabel="選擇 assignee"
      isOpen={isOpen}
      onToggle={() => setIsOpen((v) => !v)}
      onClose={() => setIsOpen(false)}
    >
      {options.length === 0 ? (
        <div className="px-3 py-2 text-xs text-[--color-text-muted]">
          此 repo 沒有任何 assignee
        </div>
      ) : (
        <ul className="text-xs">
          {options.map((login) => {
            const isChecked = selected.includes(login);
            return (
              <li key={login}>
                <button
                  type="button"
                  onClick={() => toggle(login)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[--color-surface-overlay]"
                >
                  <span className="flex h-4 w-4 items-center justify-center">
                    {isChecked && (
                      <Check size={12} strokeWidth={2.5} className="text-[--color-brand]" />
                    )}
                  </span>
                  <img
                    src={`https://github.com/${login}.png?size=32`}
                    alt=""
                    aria-hidden="true"
                    className="h-4 w-4 flex-shrink-0 rounded-full bg-[--color-surface-overlay]"
                  />
                  <span className="truncate text-[--color-text-primary]">{login}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </DropdownShell>
  );
};

export { textColorForBg };
export default IssueFilterBar;
