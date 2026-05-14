import { AlertTriangle, CircleDot, Clock, FolderGit2, Inbox } from 'lucide-react';
import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { TAppShellContext } from '../AppShell';
import CompletionBarChart from '../charts/CompletionBarChart';
import StatusDonutChart from '../charts/StatusDonutChart';
import UserRoleTable from '../components/admin/UserRoleTable';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';
import RepoCard from '../components/RepoCard';
import StatCard from '../components/StatCard';

/** 目前所有 repo 預設 owner（與 Sidebar 保持一致）*/
const DEFAULT_OWNER = 'zenbuapps';
const pinKey = (owner: string, name: string): string => `${owner}/${name}`;

/**
 * 總覽頁
 * 頂部統計卡 + 兩張圖表 + Repo 卡片 grid +（admin）使用者管理區塊
 *
 * issue #16：
 *   - 統計卡的 Open / Closed Issues 改為「全 GitHub issue」數字（後端 buildRepoBundle 已換實作）
 *   - Repo 卡片 grid 不再以 roadmapCount > 0 過濾，顯示所有可見 repo
 *   - 每張卡片新增 ⭐ 按鈕，可直接 pin/unpin（影響 Sidebar 預設清單）
 *   - 圖表下方加入「使用者管理」區塊；只在 session.user.role === 'admin' 時渲染
 */
const OverviewPage = () => {
  const { summary, hiddenRepos, pinnedRepos, togglePinnedRepo, session } =
    useOutletContext<TAppShellContext>();

  const isAdmin =
    session.state.status === 'authenticated' && session.state.user.role === 'admin';

  /** 圖表用：仍以「有 roadmap」過濾，避免空 roadmap 把 bar chart 拉平成一片 0 */
  const reposWithRoadmaps = useMemo(() => {
    if (!summary) return [];
    const visible = hiddenRepos.size > 0
      ? summary.repos.filter((r) => !hiddenRepos.has(r.name))
      : summary.repos;
    return visible.filter((r) => r.roadmapCount > 0);
  }, [summary, hiddenRepos]);

  /** 卡片 grid 用：顯示所有可見 repo（issue #16）*/
  const visibleRepos = useMemo(() => {
    if (!summary) return [];
    return hiddenRepos.size > 0
      ? summary.repos.filter((r) => !hiddenRepos.has(r.name))
      : summary.repos;
  }, [summary, hiddenRepos]);

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

  if (!summary) return null;

  const { totals } = summary;

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
              Issue 分布
            </h2>
            <p className="text-xs text-[--color-text-muted]">
              各 repo 的 open / closed issues 堆疊
            </p>
          </div>
          {reposWithRoadmaps.length > 0 ? (
            <CompletionBarChart repos={reposWithRoadmaps} />
          ) : (
            <div className="flex h-[320px] items-center justify-center text-sm text-[--color-text-muted]">
              尚無資料
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

      {/* Repo 卡片 grid（issue #16：全部 visible repo，附 ⭐ pin 按鈕）*/}
      {visibleRepos.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="目前沒有任何 repo"
          description="zenbuapps org 底下若有新 repo，會自動出現在這裡。"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleRepos.map((repo) => {
            const isPinned = pinnedRepos.has(pinKey(DEFAULT_OWNER, repo.name));
            return (
              <RepoCard
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
       * 使用者管理（issue #16）—— 僅 admin 看得到。
       * 一般使用者不會渲染這個 section（也不會觸發 fetch /api/admin/users，避免 403 噪音）。
       */}
      {isAdmin && (
        <div className="mt-8">
          <UserRoleTable />
        </div>
      )}
    </>
  );
};

export default OverviewPage;
