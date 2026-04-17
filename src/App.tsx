import { HashRouter, Route, Routes } from 'react-router-dom';
import AppShell from './AppShell';
import OverviewPage from './pages/OverviewPage';
import RoadmapPage from './pages/RoadmapPage';

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
      </Route>
    </Routes>
  </HashRouter>
);

export default App;
