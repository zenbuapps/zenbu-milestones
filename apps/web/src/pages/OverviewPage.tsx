import { AlertTriangle, CircleDot, Clock, FolderGit2, Inbox } from 'lucide-react';
import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { TAppShellContext } from '../AppShell';
import CompletionBarChart from '../charts/CompletionBarChart';
import StatusDonutChart from '../charts/StatusDonutChart';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';
import RepoCard from '../components/RepoCard';
import StatCard from '../components/StatCard';

/**
 * 總覽頁
 * 頂部統計卡 + 兩張圖表 + Repo 卡片 grid
 */
const OverviewPage = () => {
  const { summary, hiddenRepos } = useOutletContext<TAppShellContext>();

  const activeRepos = useMemo(() => {
    if (!summary) return [];
    // 先套 admin visibleOnUI 過濾再挑 milestone > 0 的
    const visible = hiddenRepos.size > 0
      ? summary.repos.filter((r) => !hiddenRepos.has(r.name))
      : summary.repos;
    return visible.filter((r) => r.milestoneCount > 0);
  }, [summary, hiddenRepos]);

  // Donut 用的狀態分布：透過 summary.totals 推導
  const donutData = useMemo(() => {
    if (!summary) return { done: 0, inProgress: 0, overdue: 0, noDue: 0 };
    const done = summary.totals.closedMilestones;
    const overdue = summary.totals.overdueMilestones;
    // openMilestones 包含 overdue 與 in_progress 與 no_due；
    // 在 summary 層級我們無法精確區分 in_progress vs no_due，
    // 所以將非 overdue 的 open 視為 in_progress（no_due 顯示為 0）。
    // 這是 summary 的精度限制，RoadmapPage 會用 detail 精確分類。
    const inProgress = Math.max(0, summary.totals.openMilestones - overdue);
    return { done, inProgress, overdue, noDue: 0 };
  }, [summary]);

  if (!summary) return null;

  const { totals } = summary;

  return (
    <>
      <PageHeader
        title="總覽"
        description="所有專案的 milestone 進度與 roadmap"
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
          label="進行中 Milestones"
          value={totals.openMilestones}
          sub={`已完成 ${totals.closedMilestones}`}
          icon={Clock}
          color="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="逾期 Milestones"
          value={
            <span className={totals.overdueMilestones > 0 ? 'text-[--color-error]' : undefined}>
              {totals.overdueMilestones}
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
              Issue 分布
            </h2>
            <p className="text-xs text-[--color-text-muted]">
              各 repo 的 open / closed issues 堆疊
            </p>
          </div>
          {activeRepos.length > 0 ? (
            <CompletionBarChart repos={activeRepos} />
          ) : (
            <div className="flex h-[320px] items-center justify-center text-sm text-[--color-text-muted]">
              尚無資料
            </div>
          )}
        </div>

        <div className="card p-5">
          <div className="mb-3">
            <h2 className="text-base font-semibold text-[--color-text-primary]">
              Milestone 狀態分布
            </h2>
            <p className="text-xs text-[--color-text-muted]">
              所有 repo 中的 milestone 完成/進行/逾期比例
            </p>
          </div>
          <StatusDonutChart {...donutData} />
        </div>
      </div>

      {/* Repo 卡片 grid */}
      {activeRepos.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="目前沒有任何有 milestone 的 repo"
          description="當 org 底下的 repo 建立了 milestone 後，會自動出現在這裡。"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {activeRepos.map((repo) => (
            <RepoCard key={repo.name} repo={repo} />
          ))}
        </div>
      )}
    </>
  );
};

export default OverviewPage;
