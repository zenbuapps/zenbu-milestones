import { AlertOctagon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { OverviewSkeleton, SidebarSkeleton } from './components/AppShellSkeleton';
import EmptyState from './components/EmptyState';
import Footer from './components/Footer';
import RequireAuthGate from './components/RequireAuthGate';
import Sidebar from './components/Sidebar';
import ToastProvider from './components/Toast/ToastProvider';
import TopNav from './components/TopNav';
import {
  ApiError,
  fetchMyPinnedRepos,
  fetchPublicRepoSettings,
  fetchSummary,
  pinRepo as apiPinRepo,
  unpinRepo as apiUnpinRepo,
} from './data/api';
import { invalidateAllRepoDetails } from './data/repoDetailCache';
import {
  clearCachedSummary,
  readCachedSummary,
  writeCachedSummary,
} from './data/summaryCache';
import type { Summary } from 'shared';
import { useSession, type UseSessionResult } from './hooks/useSession';

/** 將 owner/name 組合成 sidebar 與 lookup 用的 unique key（與 PinnedRepoDTO 一致）*/
const pinKey = (owner: string, name: string): string => `${owner}/${name}`;

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
  /**
   * 個人化釘選清單（issue #16）。key 為 `${owner}/${name}`；
   * - empty 代表使用者尚未釘任何 repo（Sidebar 顯示提示）
   * - 後端未部署 / 無 session 時為空 set（fall back 行為由消費端決定）
   */
  pinnedRepos: Set<string>;
  /**
   * 樂觀切換釘選狀態：先動本地 set 立即反映 UI，再呼叫後端；
   * 失敗時自動 revert。回傳 promise 讓呼叫端可顯示 spinner / error toast。
   */
  togglePinnedRepo: (repoOwner: string, repoName: string) => Promise<void>;
};

/**
 * 應用外殼
 * 負責：載入 summary.json、組合 TopNav + Sidebar + main outlet、協調手機版 drawer 狀態
 */
const AppShell = () => {
  // issue #31：開始就用 sessionStorage 的舊資料 hydration，避免每次重整都 white-screen
  // 緊接著 useEffect 會打 fetchSummary 拉新資料覆蓋（stale-while-revalidate）
  const [summary, setSummary] = useState<Summary | null>(() => readCachedSummary());
  const [error, setError] = useState<Error | null>(null);
  /** 後端明確告知需要登入（HTTP 401）；與一般錯誤分流渲染 RequireAuthGate */
  const [needsAuth, setNeedsAuth] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [hiddenRepos, setHiddenRepos] = useState<Set<string>>(() => new Set());
  const [nonSubmittableRepos, setNonSubmittableRepos] = useState<Set<string>>(() => new Set());
  /** 釘選清單；key = `${owner}/${name}`。issue #16 */
  const [pinnedRepos, setPinnedRepos] = useState<Set<string>>(() => new Set());
  /** 使用者按 TopNav 重新整理按鈕時的旋轉狀態；獨立於初次載入，避免覆蓋既有資料閃白 */
  const [isRefreshingSummary, setIsRefreshingSummary] = useState<boolean>(false);
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

  /**
   * 手動重新拉取 summary（TopNav 的 RefreshCw 按鈕觸發）。
   * 不重置 `summary` 為 null，stale-while-revalidate：UI 保留現有資料，
   * 直到新資料回來，避免使用者看到整頁 loading 閃白。
   */
  const refreshSummary = useCallback(async () => {
    if (sessionStatus !== 'authenticated') return;
    setIsRefreshingSummary(true);
    // issue #26：使用者按「重新整理」應強制清掉客戶端 repo detail 快取，
    // 否則切回看過的 repo 仍會吃舊資料
    invalidateAllRepoDetails();
    try {
      const data = await fetchSummary();
      setSummary(data);
      writeCachedSummary(data);
    } catch (err) {
      // 不打斷 UI；console.error 留紀錄，避免 prod 上靜默失敗難以查
      console.error('[AppShell] refreshSummary 失敗：', err);
    } finally {
      setIsRefreshingSummary(false);
    }
  }, [sessionStatus]);

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
      setPinnedRepos(new Set());
      // 未登入時清掉先前快取，避免下一個使用者拿到上一個 session 的資料
      clearCachedSummary();
      return;
    }

    let cancelled = false;
    setNeedsAuth(false);
    setError(null);
    // summary + settings + pinned 並行取，三者各自失敗不互相影響
    void Promise.all([
      fetchSummary()
        .then((data) => {
          if (!cancelled) {
            setSummary(data);
            writeCachedSummary(data);
          }
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          if (err instanceof ApiError && err.httpStatus === 401) {
            setSummary(null);
            setNeedsAuth(true);
            clearCachedSummary();
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
      fetchMyPinnedRepos()
        .then((rows) => {
          if (cancelled) return;
          setPinnedRepos(new Set(rows.map((r) => pinKey(r.repoOwner, r.repoName))));
        })
        .catch((err: unknown) => {
          // 後端尚未部署 PinnedRepo 表（migration 未跑）或 401 → 視為空集合
          // 不阻斷其他資料載入；console.warn 留紀錄供除錯
          if (!cancelled) {
            setPinnedRepos(new Set());
            console.warn('[AppShell] fetchMyPinnedRepos 失敗，使用空集合：', err);
          }
        }),
    ]);
    return () => {
      cancelled = true;
    };
  }, [sessionStatus]);

  /**
   * 樂觀切換釘選狀態（issue #16）
   * - 先把 set 立即更新讓 UI 反映；
   * - 呼叫後端，失敗時 revert 並 log warn；
   * - 重複 pin / unpin 觸發後端 409 / 404 視為「狀態已對齊」，吞掉錯誤
   */
  const togglePinnedRepo = useCallback(async (repoOwner: string, repoName: string) => {
    const key = pinKey(repoOwner, repoName);
    const wasPinned = pinnedRepos.has(key);
    setPinnedRepos((prev) => {
      const next = new Set(prev);
      if (wasPinned) next.delete(key);
      else next.add(key);
      return next;
    });
    try {
      if (wasPinned) {
        await apiUnpinRepo(repoOwner, repoName);
      } else {
        await apiPinRepo(repoOwner, repoName);
      }
    } catch (err: unknown) {
      const httpStatus = err instanceof ApiError ? err.httpStatus : null;
      // 409 / 404 代表後端狀態與新意圖已一致（重複 pin / 重複 unpin），不必 revert
      if (httpStatus !== 409 && httpStatus !== 404) {
        setPinnedRepos((prev) => {
          const next = new Set(prev);
          if (wasPinned) next.add(key);
          else next.delete(key);
          return next;
        });
        console.warn('[AppShell] togglePinnedRepo 失敗，已回滾：', err);
      }
    }
  }, [pinnedRepos]);

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
          <TopNav summary={null} session={session.state} onLogin={session.login} onLogout={session.logout} onRefresh={refreshSummary} isRefreshing={isRefreshingSummary} />
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
          <TopNav summary={null} session={session.state} onLogin={session.login} onLogout={session.logout} onRefresh={refreshSummary} isRefreshing={isRefreshingSummary} />
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
    // issue #31：用 skeleton 取代原本置中 LoadingSpinner
    // 維持 sidebar + main 兩欄結構，使用者第一時間看到的是熟悉的版面而非單調轉圈
    return (
      <ToastProvider>
        <div className="flex h-full flex-col">
          <TopNav summary={null} session={session.state} onLogin={session.login} onLogout={session.logout} onRefresh={refreshSummary} isRefreshing={isRefreshingSummary} />
          <div className="flex flex-1 overflow-hidden bg-[--color-surface]">
            <SidebarSkeleton />
            <OverviewSkeleton />
          </div>
        </div>
      </ToastProvider>
    );
  }

  const context: TAppShellContext = {
    summary,
    session,
    hiddenRepos,
    nonSubmittableRepos,
    refreshRepoSettings,
    pinnedRepos,
    togglePinnedRepo,
  };

  return (
    <ToastProvider>
      <div className="flex h-full flex-col">
        <TopNav summary={summary} onMenuClick={openSidebar} session={session.state} onLogin={session.login} onLogout={session.logout} onRefresh={refreshSummary} isRefreshing={isRefreshingSummary} />
        <div className="relative flex flex-1 overflow-hidden">
          <Sidebar
            summary={summary}
            hiddenRepos={hiddenRepos}
            pinnedRepos={pinnedRepos}
            onTogglePin={togglePinnedRepo}
            isAdmin={
              session.state.status === 'authenticated' &&
              session.state.user.role === 'admin'
            }
            isOpen={isSidebarOpen}
            onClose={closeSidebar}
          />

          {/* 手機版 drawer backdrop */}
          {isSidebarOpen && (
            <button
              type="button"
              aria-label="關閉選單"
              onClick={closeSidebar}
              className="fixed inset-0 top-16 z-30 bg-black/40 md:hidden"
            />
          )}

          <main className="flex flex-1 flex-col overflow-y-auto bg-[--color-surface]">
            <div className="flex-1 p-4 sm:p-6">
              <Outlet context={context} />
            </div>
            <Footer />
          </main>
        </div>
      </div>
    </ToastProvider>
  );
};

export default AppShell;
