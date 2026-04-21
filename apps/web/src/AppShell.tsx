import { AlertOctagon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import EmptyState from './components/EmptyState';
import LoadingSpinner from './components/LoadingSpinner';
import Sidebar from './components/Sidebar';
import ToastProvider from './components/Toast/ToastProvider';
import TopNav from './components/TopNav';
import { fetchPublicRepoSettings } from './data/api';
import { loadSummary } from './data/loader';
import type { Summary } from './data/types';
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
   * 未來 RoadmapPage 的「提出 Issue」按鈕可據此顯示 disabled tooltip
   */
  nonSubmittableRepos: Set<string>;
};

/**
 * 應用外殼
 * 負責：載入 summary.json、組合 TopNav + Sidebar + main outlet、協調手機版 drawer 狀態
 */
const AppShell = () => {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [hiddenRepos, setHiddenRepos] = useState<Set<string>>(() => new Set());
  const [nonSubmittableRepos, setNonSubmittableRepos] = useState<Set<string>>(() => new Set());
  const location = useLocation();
  const session = useSession();

  useEffect(() => {
    let cancelled = false;
    // summary + settings 並行取，兩者各自失敗不互相影響
    void Promise.all([
      loadSummary()
        .then((data) => {
          if (!cancelled) setSummary(data);
        })
        .catch((err: Error) => {
          if (!cancelled) setError(err);
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
  }, []);

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

  if (error) {
    return (
      <ToastProvider>
        <div className="flex h-full flex-col">
          <TopNav summary={null} session={session.state} onLogin={session.login} onLogout={session.logout} />
          <div className="flex flex-1 items-center justify-center bg-[--color-surface] p-6">
            <EmptyState
              icon={AlertOctagon}
              title="資料載入失敗"
              description={`無法讀取 summary.json：${error.message}`}
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

  const context: TAppShellContext = { summary, session, hiddenRepos, nonSubmittableRepos };

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
