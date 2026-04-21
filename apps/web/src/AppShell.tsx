import { AlertOctagon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import EmptyState from './components/EmptyState';
import LoadingSpinner from './components/LoadingSpinner';
import RequireAuthGate from './components/RequireAuthGate';
import Sidebar from './components/Sidebar';
import ToastProvider from './components/Toast/ToastProvider';
import TopNav from './components/TopNav';
import { ApiError, fetchPublicRepoSettings, fetchSummary } from './data/api';
import type { Summary } from 'shared';
import { useSession, type UseSessionResult } from './hooks/useSession';

/**
 * 路由 outlet 向下共享的 context 形狀
 * 子頁面透過 `useOutletContext<TAppShellContext>()` 取用
 */
export type TAppShellContext = {
  summary: Summary | null;
  session: UseSessionResult;
  /**
   * 被管理員設為「不顯示於 UI」的 repo 名稱集合（key = repoName，目前僅 zenbuapps 單 org）
   * 來自 GET /api/repos/settings，後端不可用時為空 set（fall back 顯示全部）
   */
  hiddenRepos: Set<string>;
  /**
   * 被管理員設為「不接受投稿」的 repo 名稱集合
   * RoadmapPage 的「提出 Issue」按鈕據此 disabled
   */
  nonSubmittableRepos: Set<string>;
  /**
   * 重新拉取 /api/repos/settings 並更新兩個 set。
   * Admin 在 RepoSettingsTable toggle 完後呼叫此 callback，
   * 可讓 Sidebar / OverviewPage / RoadmapPage 立即反映，不必 F5。
   */
  refreshRepoSettings: () => void;
};

/**
 * 應用外殼
 * 負責：載入 summary.json、組合 TopNav + Sidebar + main outlet、協調手機版 drawer 狀態
 */
const AppShell = () => {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<Error | null>(null);
  /** 後端明確告知需要登入（HTTP 401）；與一般錯誤分流渲染 RequireAuthGate */
  const [needsAuth, setNeedsAuth] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [hiddenRepos, setHiddenRepos] = useState<Set<string>>(() => new Set());
  const [nonSubmittableRepos, setNonSubmittableRepos] = useState<Set<string>>(() => new Set());
  const location = useLocation();
  const session = useSession();
  const sessionStatus = session.state.status;

  // 抽出 settings 拉取，讓 admin toggle 完可重呼一次（不需 F5）
  const refreshRepoSettings = useCallback(() => {
    void fetchPublicRepoSettings().then((rows) => {
      setHiddenRepos(new Set(rows.filter((r) => !r.visibleOnUI).map((r) => r.repoName)));
      setNonSubmittableRepos(
        new Set(rows.filter((r) => !r.canSubmitIssue).map((r) => r.repoName)),
      );
    });
  }, []);

  useEffect(() => {
    // Session 尚在 loading 時不打 summary（避免先打一次 401 再打一次成功 —— 浪費流量且閃 gate）
    if (sessionStatus === 'loading') {
      return;
    }
    // 未登入（且後端可用）直接掛 gate，不必打 API
    if (sessionStatus === 'unauthenticated') {
      setSummary(null);
      setError(null);
      setNeedsAuth(true);
      return;
    }

    let cancelled = false;
    setNeedsAuth(false);
    setError(null);
    // summary + settings 並行取，兩者各自失敗不互相影響
    void Promise.all([
      fetchSummary()
        .then((data) => {
          if (!cancelled) setSummary(data);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          if (err instanceof ApiError && err.httpStatus === 401) {
            setSummary(null);
            setNeedsAuth(true);
            return;
          }
          setError(err instanceof Error ? err : new Error(String(err)));
        }),
      fetchPublicRepoSettings().then((rows) => {
        if (cancelled) return;
        setHiddenRepos(new Set(rows.filter((r) => !r.visibleOnUI).map((r) => r.repoName)));
        setNonSubmittableRepos(
          new Set(rows.filter((r) => !r.canSubmitIssue).map((r) => r.repoName)),
        );
      }),
    ]);
    return () => {
      cancelled = true;
    };
  }, [sessionStatus]);

  // 路由變化時自動關閉 drawer（保險；NavLink 的 onClick 也會關閉）
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  // drawer 開啟時鎖住 body scroll，避免底層頁面跟著捲動（僅影響手機版）
  useEffect(() => {
    if (isSidebarOpen) {
      const previous = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = previous;
      };
    }
    return undefined;
  }, [isSidebarOpen]);

  const openSidebar = useCallback(() => setIsSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);

  if (needsAuth) {
    return (
      <ToastProvider>
        <div className="flex h-full flex-col">
          <TopNav summary={null} session={session.state} onLogin={session.login} onLogout={session.logout} />
          <div className="flex flex-1 items-center justify-center bg-[--color-surface] p-6">
            <RequireAuthGate onLogin={session.login} />
          </div>
        </div>
      </ToastProvider>
    );
  }

  if (error) {
    return (
      <ToastProvider>
        <div className="flex h-full flex-col">
          <TopNav summary={null} session={session.state} onLogin={session.login} onLogout={session.logout} />
          <div className="flex flex-1 items-center justify-center bg-[--color-surface] p-6">
            <EmptyState
              icon={AlertOctagon}
              title="資料載入失敗"
              description={`無法讀取儀表板資料：${error.message}`}
            />
          </div>
        </div>
      </ToastProvider>
    );
  }

  if (!summary) {
    return (
      <ToastProvider>
        <div className="flex h-full flex-col">
          <TopNav summary={null} session={session.state} onLogin={session.login} onLogout={session.logout} />
          <div className="flex flex-1 items-center justify-center bg-[--color-surface]">
            <LoadingSpinner size="lg" />
          </div>
        </div>
      </ToastProvider>
    );
  }

  const context: TAppShellContext = { summary, session, hiddenRepos, nonSubmittableRepos, refreshRepoSettings };

  return (
    <ToastProvider>
      <div className="flex h-full flex-col">
        <TopNav summary={summary} onMenuClick={openSidebar} session={session.state} onLogin={session.login} onLogout={session.logout} />
        <div className="relative flex flex-1 overflow-hidden">
          <Sidebar summary={summary} hiddenRepos={hiddenRepos} isOpen={isSidebarOpen} onClose={closeSidebar} />

          {/* 手機版 drawer backdrop */}
          {isSidebarOpen && (
            <button
              type="button"
              aria-label="關閉選單"
              onClick={closeSidebar}
              className="fixed inset-0 top-16 z-30 bg-black/40 md:hidden"
            />
          )}

          <main className="flex-1 overflow-y-auto bg-[--color-surface]">
            <div className="p-4 sm:p-6">
              <Outlet context={context} />
            </div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
};

export default AppShell;
