import { lazy, Suspense } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import AppShell from './AppShell';
import LoadingSpinner from './components/LoadingSpinner';
import MyIssuesPage from './pages/MyIssuesPage';
import OverviewPage from './pages/OverviewPage';
import RoadmapPage from './pages/RoadmapPage';

/**
 * AdminPage 採用 lazy import：
 * 多數使用者永遠不會進入 `/admin`，無需把三張 admin table 的 JS 放進 initial chunk。
 * 這樣 OverviewPage / RoadmapPage 的 TTI 不受後台程式碼影響。
 */
const AdminPage = lazy(() => import('./pages/AdminPage'));

/** 切分 lazy chunk 時的 fallback（AppShell 已有外層 LoadingSpinner，這裡只墊一個薄一點的置中容器） */
const LazyFallback = () => (
  <div className="flex min-h-[40vh] items-center justify-center">
    <LoadingSpinner size="lg" />
  </div>
);

/**
 * 應用根元件
 * 部署於 GitHub Pages，使用 HashRouter 以避免靜態 404
 */
const App = () => (
  <HashRouter>
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<OverviewPage />} />
        <Route path="repo/:name" element={<RoadmapPage />} />
        <Route path="me/issues" element={<MyIssuesPage />} />
        <Route
          path="admin"
          element={
            <Suspense fallback={<LazyFallback />}>
              <AdminPage />
            </Suspense>
          }
        />
      </Route>
    </Routes>
  </HashRouter>
);

export default App;
