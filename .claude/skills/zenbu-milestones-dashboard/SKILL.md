---
name: zenbu-milestones-dashboard
description: Zenbu Milestones 專案特定架構與工作慣例索引。當任務涉及此專案的 pnpm monorepo 結構（apps/web + apps/api + packages/shared）、React SPA 前端、NestJS + Prisma 後端、後端 DashboardModule（runtime 抓 GitHub + TTL cache）、訪客投稿 issue 流程、admin 審核、在 Overview 或 Roadmap 頁新增元件、調整 StatCard / Sidebar / 時間軸時載入。包含資料契約規則、Tailwind 3 + CSS 變數設計系統規範、pnpm workspace 規範的入口索引。本 skill 採索引式架構：請依任務類型讀取對應的 `.claude/rules/*.rule.md`。
---

# Zenbu Milestones Dashboard

本專案為 **pnpm monorepo**，前端為 React SPA，後端為 NestJS + Prisma + PostgreSQL，用途是視覺化呈現 GitHub `zenbuapps` 組織旗下所有 repo 的 milestone / issue 進度，並提供訪客投稿 issue → admin 審核 → 轉送至 GitHub 的工作流程。

---

## 載入時機

本 skill 在下列情境必須載入：

- 在此 repo 中做任何程式碼修改前（新增元件、調整資料流、升級依賴、動 Prisma schema）
- 任務提到「milestone」「roadmap」「org 資料」「issue 列表」「圖表」「Sidebar」「StatCard」「投稿」「admin 審核」
- 觸發關鍵字：`DashboardService`、`loader`、`types`、`api.ts`、`AppShell`、`OverviewPage`、`RoadmapPage`、`HashRouter`、`@prisma/client`、`DATABASE_URL`、`VITE_API_BASE_URL`、`RequireAuthGate`

---

## Workspace 結構

```
zenbu-milestones/
├── apps/
│   ├── web/       Vite 5 + React 18 + TypeScript + Tailwind 3
│   └── api/       NestJS 11 + Prisma 5 + PostgreSQL + Passport Google OAuth
└── packages/
    └── shared/    共用 DTO / 型別（tsup 產 ESM + CJS + d.ts）
```

`apps/web` 與 `apps/api` 都 `import from 'shared'`。`packages/shared` 必須先 build 下游才能解析型別（`pnpm build` 已寫死正確順序）。

---

## 快速架構概念

### 資料源：後端 Dashboard Module

```
[GitHub REST API]
       ↓ (runtime, apps/api/src/dashboard/dashboard.service.ts)
   GithubService (Octokit) + createLimiter + SENSITIVE_LABELS 過濾
       ↓
   DashboardCacheService（in-memory TTL 5min，prefix delete）
       ↓ (HTTP, apps/api/src/dashboard/*.controller.ts)
   AuthenticatedGuard / AdminGuard
       ↓
[React SPA]
   apps/web/src/data/api.ts（fetch + session cookie + envelope unwrap）
       ↓
   AppShell / OverviewPage / RoadmapPage（全部要登入，未登入掛 RequireAuthGate）
```

**主要 endpoints**：
- `GET  /api/summary` — `Summary`
- `GET  /api/repos/:owner/:name/detail` — `RepoDetail`
- `GET  /api/repos/:owner/:name/milestones/:number/issues` — `MilestoneIssuesPage`
- `GET  /api/health/github` — `GithubHealthStatus`（公開）
- `POST /api/admin/refresh-data` — 清 cache（admin only，10s debounce）

路徑常數：`packages/shared/src/index.ts::API_PATHS`。前端呼叫一律走這個，不 hardcode URL。

### 共用契約：`packages/shared/src/index.ts`

後端 `DashboardService`、前端 `api.ts` 客戶端、前端消費元件 **共用** 這一份型別定義。**任何欄位變動都是跨端契約變動**，依 `.claude/rules/data-contract.rule.md` 的流程處理。

### 路由：HashRouter（遷移待定）

`apps/web/src/App.tsx` 目前使用 `HashRouter`（舊 GitHub Pages 部署遺留）。新部署平台支援 SPA fallback 時可改回 `BrowserRouter`，但這要同時改所有既有深層連結，建議與平台遷移同步處理。

### 未登入流程

`OverviewPage` 與 `RoadmapPage` 都要登入。未登入時掛 `<RequireAuthGate />`（全螢幕提示 + Google 登入按鈕）。Session 狀態優先於 API 呼叫：若 `useSession` 已確認 unauthenticated，連 API 都不打；若 session 是 authenticated 但 API 回 401（cookie 失效），也走 gate。

---

## Rule 索引（依任務類型讀取）

本專案的規範不放 SKILL.md，全部拆成 `.claude/rules/*.rule.md`，依任務讀對應檔案：

| 任務類型 | 讀取 rule |
|---|---|
| 新增 / 修改 shared DTO 欄位；改 DashboardService 產出形狀 | `.claude/rules/data-contract.rule.md` |
| 做 UI（新元件、頁面、配色、按鈕、圖示、響應式）| `.claude/rules/styling-system.rule.md` |
| 動依賴、`package.json`、workspace 建置順序 | `.claude/rules/pnpm-and-ci.rule.md` |

**判斷原則**：只讀用得到的 rule。例如「在 OverviewPage 加一張新圖表」只需 `styling-system.rule.md`；「改 milestone 的某欄位」要 `data-contract.rule.md`；「升級 pnpm」要 `pnpm-and-ci.rule.md`。

---

## Library Skill 索引（依 import 觸發）

專案依賴的第三方 library 已有專屬 skill（在 `.claude/skills/`），import 到相關程式時主動載入：

| 場景 | Skill |
|---|---|
| 程式 import 自 `@octokit/rest`（只在後端 `apps/api/src/github/`）| `.claude/skills/octokit-rest-v21/SKILL.md` |
| 程式 import 自 `react-router-dom`、動路由、Outlet、useOutletContext | `.claude/skills/react-router-v6/SKILL.md` |
| 動 `tailwind.config.js`、`globals.css`、看到 `bg-[--color-*]` 的疑問 | `.claude/skills/tailwindcss-v3/SKILL.md` |
| 觸碰到 ZenbuApps 統一設計規範（TopNav / Sidebar 共用模式、StatCard、PageHeader、Empty State 等）| `.claude/skills/zenbuapps-design-system/SKILL.md` |

**版本鎖定提醒**：
- react-router-dom **v6.28.x**（不是 v7）
- tailwindcss **v3.4.x**（不是 v4）
- `@octokit/rest` **v21.x**
- `@nestjs/*` **v11.x**
- `prisma` / `@prisma/client` **v5.22.x**

這些在 `.claude/rules/pnpm-and-ci.rule.md` 的「依賴升級節奏」段落有詳述。

---

## 工作前的 self-check

動手寫任何程式碼前，先確認：

1. **我是否知道這個變更會跨越 shared / api / web 多端？** 若是，必讀 `data-contract.rule.md`
2. **我是否新增 UI 元件 / 色票？** 若是，必讀 `styling-system.rule.md`
3. **我是否動 package.json / workspace / 建置順序？** 若是，必讀 `pnpm-and-ci.rule.md`
4. **我是否動 `apps/api/prisma/schema.prisma`？** 若是，改完要跑 `pnpm prisma:generate`
5. **我是否動 `packages/shared` 的 export？** 若是，下游要重新 build shared 才拿得到新型別
6. **我是否改 `DashboardService` 邏輯卻測到舊資料？** Cache 在作怪，重啟 api 或打 refresh-data
7. **我是否使用一個版本敏感的 library API？** 若是，載對應 lib skill

---

## 專案級禁區（無論做什麼都不能違反）

- **禁止** 使用 `npm install` / `yarn`（見 `pnpm-and-ci.rule.md`）
- **禁止** 建立 `pnpm lint` / `pnpm test` 這類不存在的腳本並呼叫它們（沒有 lint、沒有測試）
- **禁止** 使用 emoji 作為 UI 元素（用 lucide-react；見 `styling-system.rule.md`）
- **禁止** 在 `DashboardService` 中繞過 `createLimiter` concurrency pool（會觸發 GitHub secondary rate limit）
- **禁止** 動 `packages/shared` 的 export 後忘記 build / watch（下游會讀到舊型別）
- **禁止** 動 `apps/api/prisma/schema.prisma` 後忘記跑 `pnpm prisma:generate`（`@prisma/client` 型別不會同步）
- **禁止** 前端 hardcode API 路徑；一律用 `shared` 的 `API_PATHS` 常數
- **禁止** 在未跟 PM / 架構師對齊前擅自改 `HashRouter` → `BrowserRouter`（牽動深層連結、要配合新部署平台的 SPA fallback 設定）

---

## 常見任務的起點

### 「加一個新指標到 StatCard」
1. 確認資料是否已在 `Summary.totals`（`packages/shared/src/index.ts`）
2. 若無 → 走 `data-contract.rule.md` 的「新增欄位流程」：shared → build:shared → DashboardService → web 消費端
3. 在 `apps/web/src/pages/OverviewPage.tsx` 加一張 `<StatCard>`（用既有 `lucide-react` 圖示）
4. `pnpm typecheck` → `pnpm build` → `pnpm dev:all` 驗

### 「新增一個敏感 label」
1. 改 `apps/api/src/dashboard/dashboard.service.ts` 的 `SENSITIVE_LABELS` 集合
2. 無需改 shared 型別（已被 service 過濾，client 看不到）
3. Milestone 的 `openIssues` / `closedIssues` 仍反映 GitHub 原始計數 —— 這是故意的（見 `data-contract.rule.md`）
4. Cache 可能讓舊資料殘留，重啟 api 或打 `POST /api/admin/refresh-data`

### 「改 Milestone 時間軸的視覺」
1. 讀 `styling-system.rule.md`（顏色 / 圖示 / class 元件規範）
2. 動 `apps/web/src/components/MilestoneNode.tsx` 與（可能）`apps/web/src/components/StatusBadge.tsx`
3. 不要動 `deriveMilestoneStatus` 的分類邏輯（done / in_progress / overdue / no_due）—— UI 相依

### 「加一個新的後端 endpoint」
1. 讀 `packages/shared` 看 DTO 有沒有相對應；若無，在 shared 新增並 `pnpm build:shared`
2. `apps/api/src/<module>/` 加 Controller / Service / DTO（class-validator）
3. 若涉及 DB schema，改 `apps/api/prisma/schema.prisma` + `pnpm prisma:migrate:dev`
4. 前端在 `apps/web/src/data/api.ts` 加對應函式（路徑用 `API_PATHS` 常數；若新路徑也加到 shared 的 `API_PATHS`）

---

## 文件維護責任

動到本 skill 描述的**架構層級**事實時，必須同步：

- 動路由器（HashRouter ↔ BrowserRouter）→ 改 CLAUDE.md「路由」段落 + 本 skill
- 動 dashboard 資料源（API 路徑、cache 策略、新資料源）→ 改 `data-contract.rule.md` + `specs/data-pipeline.md` + CLAUDE.md + 本 skill
- 新增 project-level rule 檔 → 在本 skill 的「Rule 索引」表加列
- 換套件管理器 / 改 workspace 結構 → 改 `pnpm-and-ci.rule.md` + CLAUDE.md + 本 skill + serena memory
