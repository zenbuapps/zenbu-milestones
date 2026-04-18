---
name: zenbu-milestones-dashboard
description: Zenbu Milestones 專案特定架構與工作慣例索引。當任務涉及此專案的兩階段資料管線（build-time fetcher + runtime loader）、HashRouter + GitHub Pages 部署、GitHub 組織資料抓取、Milestone / Issue 視覺化、在 Overview 或 Roadmap 頁新增元件、調整 StatCard / Sidebar / 時間軸時載入。包含資料契約規則、Vite base path 規範、Tailwind 3 + CSS 變數設計系統規範、pnpm + CI workflow 規範的入口索引。本 skill 採索引式架構：請依任務類型讀取對應的 `.claude/rules/*.rule.md`。
---

# Zenbu Milestones Dashboard

本專案為 **靜態儀表板 SPA**，以視覺化方式呈現 GitHub `zenbuapps` 組織旗下所有 repo 的 milestone 與 issue 進度。部署於 GitHub Pages 的 `/zenbu-milestones/` 路徑，**無後端、無 runtime API**。

---

## 載入時機

本 skill 在下列情境必須載入：

- 在此 repo 中做任何程式碼修改前（新增元件、調整資料流、升級依賴）
- 任務提到「milestone」「roadmap」「org 資料」「issue 列表」「圖表」「Sidebar」「StatCard」
- 觸發關鍵字：`fetch-data.ts`、`loader.ts`、`types.ts`、`AppShell`、`OverviewPage`、`RoadmapPage`、`HashRouter`、`BASE_URL`、`ZENBU_ORG_READ_TOKEN`

---

## 快速架構概念

### 兩階段資料管線

```
[GitHub REST API]
       ↓ (build-time, scripts/fetch-data.ts，CI 每小時或 push master)
   @octokit/rest + p-limit(5, 8) + SENSITIVE_LABELS 過濾
       ↓
[public/data/]
   ├── summary.json       ← Summary（totals + RepoSummary[]）
   ├── repos.json         ← RepoSummary[]
   └── repos/{name}.json  ← RepoDetail（僅當 milestoneCount > 0）
       ↓ (runtime, src/data/loader.ts)
   fetch() + Map cache + import.meta.env.BASE_URL
       ↓
[React SPA]
   AppShell（載 summary，Outlet context）
   ├── OverviewPage       ← / （StatCard + 圖表 + RepoCard grid）
   └── RoadmapPage        ← #/repo/:name （Milestone 時間軸）
```

### 共用契約：`src/data/types.ts`

fetcher 與 SPA **共用** 這一份型別定義。`scripts/tsconfig.json` 特別把它 include 進 Node 專案的 project reference，確保兩端一起 type-check。**任何欄位變動都是跨端契約變動**。

### 路由：HashRouter

`src/App.tsx` 使用 `HashRouter`（不是 `BrowserRouter`），因為 GitHub Pages 不支援 SPA fallback。

---

## Rule 索引（依任務類型讀取）

本專案的規範不放 SKILL.md，全部拆成 `.claude/rules/*.rule.md`，依任務讀對應檔案：

| 任務類型 | 讀取 rule |
|---|---|
| 新增 / 修改 `src/data/types.ts` 的欄位；改 `fetch-data.ts` 的產出形狀 | `.claude/rules/data-contract.rule.md` |
| 動 `fetch()` 路徑、資源 URL、`import.meta.env.BASE_URL`、`vite.config.ts::base`、`HashRouter` → `BrowserRouter` 的考量 | `.claude/rules/vite-base-path.rule.md` |
| 做 UI（新元件、頁面、配色、按鈕、圖示、響應式）| `.claude/rules/styling-system.rule.md` |
| 動依賴、`package.json`、`.github/workflows/build-and-deploy.yml`、PAT / secret 設定 | `.claude/rules/pnpm-and-ci.rule.md` |

**判斷原則**：只讀用得到的 rule。例如「在 OverviewPage 加一張新圖表」只需 `styling-system.rule.md`；「改 milestone 的某欄位」要 `data-contract.rule.md`；「升級 pnpm」要 `pnpm-and-ci.rule.md`。

---

## Library Skill 索引（依 import 觸發）

專案依賴的第三方 library 已有專屬 skill（在 `.claude/skills/`），import 到相關程式時主動載入：

| 場景 | Skill |
|---|---|
| 程式 import 自 `@octokit/rest` 或動 `scripts/fetch-data.ts` | `.claude/skills/octokit-rest-v21/SKILL.md` |
| 程式 import 自 `react-router-dom`、動路由、Outlet、useOutletContext | `.claude/skills/react-router-v6/SKILL.md` |
| 動 `tailwind.config.js`、`globals.css`、看到 `bg-[--color-*]` 的疑問 | `.claude/skills/tailwindcss-v3/SKILL.md` |
| 觸碰到 ZenbuApps 統一設計規範（TopNav / Sidebar 共用模式、StatCard、PageHeader、Empty State 等）| `.claude/skills/zenbuapps-design-system/SKILL.md` |

**版本鎖定提醒**：
- react-router-dom **v6.28.x**（不是 v7）
- tailwindcss **v3.4.x**（不是 v4）
- `@octokit/rest` **v21.x**

這些在 `.claude/rules/pnpm-and-ci.rule.md` 的「依賴升級節奏」段落有詳述。

---

## 工作前的 self-check

動手寫任何程式碼前，先確認：

1. **我是否知道這個變更會跨越 fetcher / loader / UI 三端？** 若是，必讀 `data-contract.rule.md`
2. **我是否在程式裡拼 URL？** 若是，必讀 `vite-base-path.rule.md`
3. **我是否新增 UI 元件 / 色票？** 若是，必讀 `styling-system.rule.md`
4. **我是否動 package.json / workflow / CI？** 若是，必讀 `pnpm-and-ci.rule.md`
5. **我是否使用一個版本敏感的 library API？** 若是，載對應 lib skill

---

## 專案級禁區（無論做什麼都不能違反）

- **禁止** 在程式碼中 hard-code `/zenbu-milestones/`（見 `vite-base-path.rule.md`）
- **禁止** 改 `HashRouter` 為 `BrowserRouter`，除非同時解決 GitHub Pages SPA fallback（見 `vite-base-path.rule.md`）
- **禁止** 使用 `npm install` / `yarn`（見 `pnpm-and-ci.rule.md`）
- **禁止** 建立 `pnpm lint` / `pnpm test` 這類不存在的腳本並呼叫它們（沒有 lint、沒有測試）
- **禁止** 使用 emoji 作為 UI 元素（用 lucide-react；見 `styling-system.rule.md`）
- **禁止** 在 fetcher 中繞過 `p-limit` concurrency pool（會觸發 GitHub secondary rate limit）
- **禁止** 把 classic PAT 或含 write 權限的 token 放進 `ZENBU_ORG_READ_TOKEN`

---

## 常見任務的起點

### 「加一個新指標到 StatCard」
1. 確認資料是否已在 `Summary.totals`（`types.ts`）
2. 若無 → 走 `data-contract.rule.md` 的「新增欄位流程」，同時改 `fetch-data.ts`
3. 在 `OverviewPage.tsx` 加一張 `<StatCard>`（用既有 `lucide-react` 圖示）
4. `pnpm typecheck` → `pnpm build` → `pnpm preview` 驗證

### 「新增一個敏感 label」
1. 改 `scripts/fetch-data.ts` 的 `SENSITIVE_LABELS` 集合
2. 無需改 `types.ts`（已被 fetcher 過濾，SPA 看不到）
3. Milestone 的 `openIssues` / `closedIssues` 仍反映 GitHub 原始計數 —— 這是故意的（見 `data-contract.rule.md`）

### 「改 Milestone 時間軸的視覺」
1. 讀 `styling-system.rule.md`（顏色 / 圖示 / class 元件規範）
2. 動 `src/components/MilestoneNode.tsx` 與（可能）`src/components/StatusBadge.tsx`
3. 不要動 `deriveMilestoneStatus` 的分類邏輯（done / in_progress / overdue / no_due）—— UI 相依

### 「CI 掛了」
1. 先看 Actions log 的 `Fetch zenbuapps org data` step
2. 對照 `pnpm-and-ci.rule.md` 的「常見錯誤與修法」段落
3. 測 PAT：本地 `GH_TOKEN=... pnpm fetch-data` 能跑就不是 token 問題

---

## 文件維護責任

動到本 skill 描述的**架構層級**事實時，必須同步：

- 動 HashRouter ↔ BrowserRouter → 改 `vite-base-path.rule.md` + `.claude/CLAUDE.md`「路由」段落 + 本 skill
- 動兩階段管線（例如改抓 GraphQL）→ 改 `data-contract.rule.md` + CLAUDE.md + 本 skill
- 新增 project-level rule 檔 → 在本 skill 的「Rule 索引」表加列
- 換套件管理器 → 改 `pnpm-and-ci.rule.md` + CLAUDE.md + 本 skill + serena memory `suggested_commands.md`
