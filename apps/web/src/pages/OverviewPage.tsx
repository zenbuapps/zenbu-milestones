import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Clock,
  ExternalLink,
  FolderGit2,
  Inbox,
  Lock,
  Star,
} from 'lucide-react';
import { useMemo } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import type { OverviewIssueLite, RepoSummary } from 'shared';
import type { TAppShellContext } from '../AppShell';
import CompletionBarChart from '../charts/CompletionBarChart';
import StatusDonutChart from '../charts/StatusDonutChart';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';
import ProgressBar from '../components/ProgressBar';
import StatCard from '../components/StatCard';
import { formatTimeAgo } from '../utils/date';

/** 目前所有 repo 預設 owner（與 Sidebar 保持一致）*/
const DEFAULT_OWNER = 'zenbuapps';
const pinKey = (owner: string, name: string): string => `${owner}/${name}`;

/** issue #24：Issue 分布長條圖最多顯示 8 個 repo */
const TOP_ACTIVE_LIMIT = 8;

/** repo「活躍度」= 近 7 天新開 + 完成的 issue 數量總和 */
const activityOf = (r: RepoSummary): number =>
  r.recentOpenedCount + r.recentClosedCount;

/**
 * 總覽頁
 * 頂部統計卡 + 兩張圖表 + 兩個 issue 列表 + Repo 列表 +（admin）使用者管理區塊
 *
 * issue #24：
 *   - Issue 分布長條圖只取近 7 天最活躍的 8 個 repo（活躍度 = recentOpenedCount + recentClosedCount）
 *   - 新增「最近完成的 Issue」與「等待最久的 Open Issue」兩個列表，後端一次回 5 筆
 *   - 把原本的 RepoCard grid 改為列表式（RepoListRow），每列含近 7 天動能
 */
const OverviewPage = () => {
  const { summary, hiddenRepos, pinnedRepos, togglePinnedRepo } =
    useOutletContext<TAppShellContext>();

  /** 卡片 grid 用：顯示所有可見 repo（issue #16）*/
  const visibleRepos = useMemo(() => {
    if (!summary) return [];
    return hiddenRepos.size > 0
      ? summary.repos.filter((r) => !hiddenRepos.has(r.name))
      : summary.repos;
  }, [summary, hiddenRepos]);

  /**
   * 長條圖用：近 7 天最活躍的前 8 個 repo（issue #24）
   * - 過濾掉活躍度 0 的，避免顯示一堆空 bar
   * - 同活躍度時以 openIssues 多者優先（次要排序）
   */
  const topActiveRepos = useMemo(() => {
    return visibleRepos
      .filter((r) => activityOf(r) > 0)
      .slice()
      .sort((a, b) => {
        const diff = activityOf(b) - activityOf(a);
        if (diff !== 0) return diff;
        return b.openIssues - a.openIssues;
      })
      .slice(0, TOP_ACTIVE_LIMIT);
  }, [visibleRepos]);

  // Donut 用的狀態分布：透過 summary.totals 推導
  const donutData = useMemo(() => {
    if (!summary) return { done: 0, inProgress: 0, overdue: 0, noDue: 0 };
    const done = summary.totals.closedRoadmaps;
    const overdue = summary.totals.overdueRoadmaps;
    // openRoadmaps 包含 overdue 與 in_progress 與 no_due；
    // 在 summary 層級我們無法精確區分 in_progress vs no_due，
    // 所以將非 overdue 的 open 視為 in_progress（no_due 顯示為 0）。
    // 這是 summary 的精度限制，RoadmapPage 會用 detail 精確分類。
    const inProgress = Math.max(0, summary.totals.openRoadmaps - overdue);
    return { done, inProgress, overdue, noDue: 0 };
  }, [summary]);

  /**
   * issue #24：當 admin 把某些 repo 設為 hidden 時，後端 summary 的兩個列表仍然會包含
   * 那些 repo 的 issue（後端只認 visibleOnUI 在前台的過濾邏輯，未來再對齊）。
   * 這裡做一次 front-end 端過濾，避免使用者看到應該被隱藏的 repo issue。
   */
  const filterByVisible = (issues: OverviewIssueLite[]): OverviewIssueLite[] => {
    if (hiddenRepos.size === 0) return issues;
    return issues.filter((i) => !hiddenRepos.has(i.repoName));
  };

  if (!summary) return null;

  const { totals } = summary;
  const recentClosed = filterByVisible(summary.recentClosedIssues);
  const oldestOpen = filterByVisible(summary.oldestOpenIssues);

  return (
    <>
      <PageHeader
        title="總覽"
        description="所有專案的 roadmap 進度與 issue"
      />

      {/* 4 張 StatCard */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="活躍 Repos"
          value={totals.repos}
          sub={`共 ${totals.allRepos} 個 repositories`}
          icon={FolderGit2}
          color="bg-[--color-primary-50] text-[--color-brand]"
        />
        <StatCard
          label="進行中 Roadmaps"
          value={totals.openRoadmaps}
          sub={`已完成 ${totals.closedRoadmaps}`}
          icon={Clock}
          color="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="逾期 Roadmaps"
          value={
            <span className={totals.overdueRoadmaps > 0 ? 'text-[--color-error]' : undefined}>
              {totals.overdueRoadmaps}
            </span>
          }
          icon={AlertTriangle}
          color="bg-orange-50 text-orange-500"
        />
        <StatCard
          label="Open Issues"
          value={totals.openIssues}
          sub={`已關閉 ${totals.closedIssues}`}
          icon={CircleDot}
          color="bg-gray-100 text-gray-600"
        />
      </div>

      {/* 2 張圖表 */}
      <div className="mb-6 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="card p-5">
          <div className="mb-3">
            <h2 className="text-base font-semibold text-[--color-text-primary]">
              Issue 分布（近 7 天 Top {TOP_ACTIVE_LIMIT}）
            </h2>
            <p className="text-xs text-[--color-text-muted]">
              依近 7 天新開 + 完成 issue 數排序前 {TOP_ACTIVE_LIMIT} 個 repo，堆疊 open / closed
            </p>
          </div>
          {topActiveRepos.length > 0 ? (
            <CompletionBarChart repos={topActiveRepos} />
          ) : (
            <div className="flex h-[320px] items-center justify-center text-sm text-[--color-text-muted]">
              近 7 天沒有 issue 變動
            </div>
          )}
        </div>

        <div className="card p-5">
          <div className="mb-3">
            <h2 className="text-base font-semibold text-[--color-text-primary]">
              Roadmap 狀態分布
            </h2>
            <p className="text-xs text-[--color-text-muted]">
              所有 repo 中的 roadmap 完成/進行/逾期比例
            </p>
          </div>
          <StatusDonutChart {...donutData} />
        </div>
      </div>

      {/* 兩個 issue 列表（issue #24） */}
      <div className="mb-6 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <IssueDigestSection
          title="最近完成的 Issue"
          subtitle="近 7 天內 closed，依關閉時間由新到舊"
          icon={CheckCircle2}
          iconClass="text-green-600"
          emptyText="近 7 天沒有 issue 被關閉"
          issues={recentClosed}
          mode="closed"
        />
        <IssueDigestSection
          title="等待最久的 Open Issue"
          subtitle="目前 open 中，依建立時間由舊到新"
          icon={Clock}
          iconClass="text-orange-500"
          emptyText="目前沒有 open issue"
          issues={oldestOpen}
          mode="open"
        />
      </div>

      {/* Repo 列表（issue #24：原本的卡片 grid 改為列表式） */}
      {visibleRepos.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="目前沒有任何 repo"
          description="zenbuapps org 底下若有新 repo，會自動出現在這裡。"
        />
      ) : (
        <div className="flex flex-col gap-2">
          {visibleRepos.map((repo) => {
            const isPinned = pinnedRepos.has(pinKey(DEFAULT_OWNER, repo.name));
            return (
              <RepoListRow
                key={repo.name}
                repo={repo}
                pinned={isPinned}
                onTogglePin={() => void togglePinnedRepo(DEFAULT_OWNER, repo.name)}
              />
            );
          })}
        </div>
      )}

      {/*
       * 使用者管理（issue #16）原本嵌在這裡；issue #23 把入口移到 Sidebar 的
       * 「管理員 → 使用者列表」（/admin?tab=users），總覽頁不再嵌入該區塊。
       */}
    </>
  );
};

type TIssueDigestProps = {
  title: string;
  subtitle: string;
  icon: typeof CheckCircle2;
  iconClass: string;
  emptyText: string;
  issues: OverviewIssueLite[];
  /** 'open' 顯示「Open X 天」；'closed' 顯示「Y 前完成」 */
  mode: 'open' | 'closed';
};

/**
 * 一個總覽頁用的 issue 摘要 section（issue #24）
 * - 標題列含 icon
 * - 每筆 issue 一列：repo 名 · #number · 標題（粗體連結） · 相對時間
 * - issue.htmlUrl 為 GitHub 連結，新分頁開啟
 */
const IssueDigestSection = ({
  title,
  subtitle,
  icon: Icon,
  iconClass,
  emptyText,
  issues,
  mode,
}: TIssueDigestProps) => {
  return (
    <div className="card flex flex-col p-5">
      <div className="mb-3 flex items-center gap-2">
        <Icon size={16} strokeWidth={2.25} className={iconClass} />
        <div>
          <h2 className="text-base font-semibold text-[--color-text-primary]">
            {title}
          </h2>
          <p className="text-xs text-[--color-text-muted]">{subtitle}</p>
        </div>
      </div>
      {issues.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-6 text-sm text-[--color-text-muted]">
          {emptyText}
        </div>
      ) : (
        <ul className="divide-y divide-[--color-border]">
          {issues.map((issue) => (
            <li key={`${issue.repoName}#${issue.number}`} className="py-2">
              <a
                href={issue.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col gap-0.5"
              >
                <div className="flex items-baseline gap-2 text-xs text-[--color-text-muted]">
                  <Link
                    to={`/repo/${issue.repoName}`}
                    onClick={(e) => e.stopPropagation()}
                    className="font-medium text-[--color-text-secondary] hover:text-[--color-brand] hover:underline"
                  >
                    {issue.repoName}
                  </Link>
                  <span className="font-mono">#{issue.number}</span>
                  <span className="ml-auto">
                    {mode === 'closed'
                      ? issue.closedAt
                        ? `${formatTimeAgo(issue.closedAt)}完成`
                        : '已完成'
                      : `Open ${formatTimeAgo(issue.createdAt)}`}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-sm font-medium text-[--color-text-primary] group-hover:text-[--color-brand] group-hover:underline">
                  <span className="truncate">{issue.title}</span>
                  <ExternalLink
                    size={12}
                    strokeWidth={2}
                    className="flex-shrink-0 text-[--color-text-muted] opacity-0 group-hover:opacity-100"
                  />
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

type TRepoListRowProps = {
  repo: RepoSummary;
  pinned: boolean;
  onTogglePin: () => void;
};

/**
 * 列表式 repo 列（issue #24）：取代原本的卡片 grid。
 * 一列含：⭐ + repo 名（含 private 鎖頭） + 描述 + 整體 open/closed/完成率 + 近 7 天 +/-
 */
const RepoListRow = ({ repo, pinned, onTogglePin }: TRepoListRowProps) => {
  const completionPct = Math.round(repo.completionRate * 100);
  return (
    <div className="card flex flex-col gap-2 p-4 transition-shadow hover:shadow-sm sm:flex-row sm:items-center sm:gap-4 sm:p-5">
      {/* 左：pin + 標題 + 描述 */}
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <button
          type="button"
          onClick={onTogglePin}
          aria-label={pinned ? `取消釘選 ${repo.name}` : `釘選 ${repo.name}`}
          aria-pressed={pinned}
          title={pinned ? '取消釘選' : '釘選 — 加入 Sidebar 預設清單'}
          className={`mt-0.5 flex-shrink-0 rounded p-1 transition-colors hover:bg-[--color-surface-overlay] ${
            pinned ? 'text-[--color-brand]' : 'text-[--color-text-muted]'
          }`}
        >
          <Star size={14} strokeWidth={2} fill={pinned ? 'currentColor' : 'none'} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Link
              to={`/repo/${repo.name}`}
              className="truncate text-sm font-semibold text-[--color-text-primary] hover:text-[--color-brand] hover:underline"
            >
              {repo.name}
            </Link>
            {repo.isPrivate && (
              <Lock
                size={12}
                strokeWidth={2}
                className="flex-shrink-0 text-[--color-text-muted]"
                aria-label="private repo"
              />
            )}
            {repo.language && (
              <span className="ml-1 rounded-full bg-[--color-surface-overlay] px-1.5 py-0.5 text-[10px] font-medium text-[--color-text-muted]">
                {repo.language}
              </span>
            )}
          </div>
          {repo.description && (
            <p className="line-clamp-1 text-xs text-[--color-text-muted]">
              {repo.description}
            </p>
          )}
        </div>
      </div>

      {/* 中：整體 issue 狀況 */}
      <div className="flex flex-shrink-0 flex-col gap-1 sm:w-48">
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 text-green-700">
            <CircleDot size={12} strokeWidth={2.25} />
            {repo.openIssues}
          </span>
          <span className="inline-flex items-center gap-1 text-purple-600">
            <CheckCircle2 size={12} strokeWidth={2.25} />
            {repo.closedIssues}
          </span>
          {repo.overdueCount > 0 && (
            <span className="inline-flex items-center gap-1 font-medium text-orange-600">
              <AlertTriangle size={12} strokeWidth={2.25} />
              {repo.overdueCount} 逾期
            </span>
          )}
          <span className="ml-auto font-semibold text-[--color-text-primary]">
            {completionPct}%
          </span>
        </div>
        <ProgressBar value={repo.completionRate} />
      </div>

      {/* 右：近 7 天動能 */}
      <div className="flex flex-shrink-0 items-center gap-3 text-xs sm:w-36 sm:flex-col sm:items-end sm:gap-0.5">
        <div className="flex items-center gap-3 sm:order-2">
          <span
            className="inline-flex items-center gap-1 text-green-700"
            title="近 7 天新開 issue"
          >
            <CircleDot size={12} strokeWidth={2.25} />
            +{repo.recentOpenedCount}
          </span>
          <span
            className="inline-flex items-center gap-1 text-[--color-text-secondary]"
            title="近 7 天完成 issue"
          >
            <CheckCircle2 size={12} strokeWidth={2.25} />
            −{repo.recentClosedCount}
          </span>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-[--color-text-muted] sm:order-1">
          近 7 天
        </span>
      </div>

      {/* 進入 link icon（桌機） */}
      <Link
        to={`/repo/${repo.name}`}
        aria-label={`進入 ${repo.name}`}
        className="hidden flex-shrink-0 rounded p-1 text-[--color-text-muted] hover:bg-[--color-surface-overlay] hover:text-[--color-brand] sm:inline-flex"
      >
        <ArrowRight size={14} strokeWidth={2} />
      </Link>
    </div>
  );
};

export default OverviewPage;
