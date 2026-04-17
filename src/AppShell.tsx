import { AlertOctagon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import EmptyState from './components/EmptyState';
import LoadingSpinner from './components/LoadingSpinner';
import Sidebar from './components/Sidebar';
import TopNav from './components/TopNav';
import { loadSummary } from './data/loader';
import type { Summary } from './data/types';

/**
 * 路由 outlet 向下共享的 context 形狀
 * 子頁面透過 `useOutletContext<TAppShellContext>()` 取用
 */
export type TAppShellContext = {
  summary: Summary | null;
};

/**
 * 應用外殼
 * 負責：載入 summary.json、組合 TopNav + Sidebar + main outlet
 */
const AppShell = () => {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSummary()
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="flex h-full flex-col">
        <TopNav summary={null} />
        <div className="flex flex-1 items-center justify-center bg-[--color-surface] p-6">
          <EmptyState
            icon={AlertOctagon}
            title="資料載入失敗"
            description={`無法讀取 summary.json：${error.message}`}
          />
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex h-full flex-col">
        <TopNav summary={null} />
        <div className="flex flex-1 items-center justify-center bg-[--color-surface]">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  const context: TAppShellContext = { summary };

  return (
    <div className="flex h-full flex-col">
      <TopNav summary={summary} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar summary={summary} />
        <main className="flex-1 overflow-y-auto bg-[--color-surface]">
          <div className="p-6">
            <Outlet context={context} />
          </div>
        </main>
      </div>
    </div>
  );
};

export default AppShell;
