# CLAUDE.md

本檔案為 Claude Code（claude.ai/code）在本 repo 中工作時的指引。作為專案總綱（30 秒上手），細節規範依任務類型讀下列檔案：

- `.claude/skills/zenbu-milestones-dashboard/SKILL.md` — 專案架構索引（依任務類型路由到對應 rule）
- `.claude/rules/data-contract.rule.md` — 改 shared DTO / dashboard service 產出形狀時
- `.claude/rules/styling-system.rule.md` — 新增 UI、配色、圖示時
- `.claude/rules/pnpm-and-ci.rule.md` — 動依賴、workspace 建置順序時
- `specs/` — 資料管線 / JSON schema / 資訊架構 的穩定契約
- `.claude/skills/{octokit-rest-v21,react-router-v6,tailwindcss-v3,zenbuapps-design-system}/` — 第三方 library / 設計系統 skill

## 專案是什麼

**pnpm monorepo**，視覺化呈現 `zenbuapps` GitHub 組織下所有 repo 的 milestones 與 issues，並接受訪客投稿 issue 的工作流程：

```
apps/
  ├─ web/   Vite + React 18 + TypeScript — 前端 SPA
  └─ api/   NestJS 11 + Prisma 5 + PostgreSQL — 後端 API
            ├─ auth / issues / admin / uploads / me / repos（訪客投稿 + admin 審核）
            └─ dashboard（runtime 抓 GitHub + 5min TTL cache，取代舊 fetch-data + 靜態 JSON）
packages/
  └─ shared/  共用 DTO 型別（tsup 產 ESM + CJS + d.ts）
```

**資料源**：前端透過 `apps/web/src/data/api.ts` 呼叫後端 `/api/*`；後端 `DashboardModule` runtime 呼叫 GitHub REST API 並走 in-memory TTL cache。

**部署狀態**：後端尚未部署至雲端；前端部署平台遷移計畫待定（Vercel / Cloudflare Pages 候選）。本地開發透過 Cloudflare Tunnel 把本機 `localhost:3000` 對外公開（見下節）。

## 指令

本專案使用 **pnpm**（`packageManager` 欄位鎖定版本）。

```bash
# 開發
pnpm install           # 安裝所有 workspace 相依
pnpm dev:web           # Vite 開發伺服器（port 5173）
pnpm dev:api           # NestJS watch mode（port 3000）
pnpm dev:shared        # tsup watch（shared 套件）
pnpm dev:all           # 三個一起跑（-r --parallel）

# 打包
pnpm build             # 先 shared、再平行打 web + api
pnpm build:shared      # tsup
pnpm build:web         # tsc -b + vite build
pnpm build:api         # nest build

# 驗證
pnpm typecheck         # 所有 workspace 的 tsc --noEmit

# Prisma
pnpm prisma:generate       # 生成 @prisma/client
pnpm prisma:migrate:dev    # 開發環境 migration
```

**沒有 lint 設定**，**沒有測試框架** —— 別自己發明 `pnpm lint` / `pnpm test`。`tsc --noEmit` 是唯一的靜態檢查手段。

## 本地公開存取（Cloudflare Tunnel）

本機後端（NestJS 監聽 port 3000，對應 `.env` 中的 `API_BASE_URL=http://localhost:3000`）透過 Cloudflare Tunnel 對外公開為 `https://local-milestones.powerhouse.tw`，用於需要 HTTPS 的整合情境（OAuth callback、webhook 測試等）。

| 項目 | 值 |
|---|---|
| 公開 URL | `https://local-milestones.powerhouse.tw` |
| 指向本地 | `http://localhost:3000` |
| Tunnel 名稱 | `turbo-local` |
| Tunnel UUID | `fdf28065-c202-42d4-89dd-0440dd18cefd` |
| Config 路徑 | `%USERPROFILE%\.cloudflared\config.yml` |

此 tunnel 與 `local-turbo.powerhouse.tw`、`local-test.powerhouse.tw` 共用同一個 `turbo-local` tunnel，ingress 規則集中於同一份 `config.yml`。

### 日常操作

```powershell
# 啟動 tunnel（前景）
cloudflared tunnel run turbo-local

# 修改 config.yml 的 ingress 後，需重啟才會生效
Stop-Process -Name cloudflared -Force
cloudflared tunnel run turbo-local

# 新增 hostname（自動建立 Cloudflare CNAME）
cloudflared tunnel route dns turbo-local <hostname>.powerhouse.tw
```

### 命名限制（雷區）

**Hostname 必須為單層子網域**（如 `local-milestones.powerhouse.tw`），**不可使用多層**（如 `local.milestones.powerhouse.tw`）。原因：Cloudflare Universal SSL 僅涵蓋 `*.powerhouse.tw` 單層通配，雙層子網域會在 TLS handshake 階段失敗。沿用現有 dash 連接慣例以確保 SSL 涵蓋。

## 架構：後端 Dashboard Module

**實作**：`apps/api/src/dashboard/`
- `dashboard.service.ts` —— 用 `GithubService` 抓 org / repos / milestones / issues；`createLimiter` 做 concurrency 控制；SENSITIVE_LABELS 過濾；sort & shape 對齊 shared DTO
- `dashboard-cache.service.ts` —— in-memory TTL map（5 分鐘），支援 prefix delete
- `dashboard.controller.ts` / `admin-dashboard.controller.ts` / `github-health.controller.ts` —— HTTP layer
- 全部套 `AuthenticatedGuard`（admin endpoints 再加 `AdminGuard`）

**Cache keys**：
- `dashboard:summary`
- `dashboard:repo:{owner}/{name}`
- `dashboard:milestone-issues:{owner}/{name}/{number}:p{page}:s{perPage}`

`POST /api/admin/refresh-data` 清所有 `dashboard:` prefix，10 秒 debounce 防呆。

**前端 client**：`apps/web/src/data/api.ts` 的 `fetchSummary` / `fetchRepoDetail` / `fetchMilestoneIssues` / `refreshAdminData` / `fetchGithubHealth`，全走 `shared` 的 `API_PATHS` 常數（無 hardcode URL）。

### 共用契約

`packages/shared/src/index.ts` 最底下兩個 section（Dashboard data + Phase 2）定義 `Summary` / `RepoDetail` / `Milestone` / `IssueLite` 等型別，是後端產出與前端消費的唯一事實來源。改動任一欄位需同步三端（shared / api / web），詳見 `.claude/rules/data-contract.rule.md`。

### 路由與登入

`apps/web/src/App.tsx` 目前使用 `HashRouter`（舊 GitHub Pages 部署遺留）。兩條路由：
- `/` → `OverviewPage`（所有 repo）
- `#/repo/:name` → `RoadmapPage`（單一 repo 的 milestone / issue）

**兩頁都要登入才能看**。未登入時 `AppShell` / `RoadmapPage` 會掛 `<RequireAuthGate />`（全螢幕登入提示 + Google 登入按鈕）。投稿 / admin 流程沿用原本的 auth 邏輯。

新部署平台確定後可改回 `BrowserRouter`（與平台遷移同步處理）。

## 樣式規範

Tailwind 3 + 一套小型的 CSS custom-property 設計系統（在 `apps/web/src/styles/globals.css`）：

- 顏色以 `--color-*` CSS 變數定義（`--color-brand`、`--color-surface`、`--color-text-*`，以及語意色 `--color-error|success|warning`）。`tailwind.config.js` 會把它們暴露成 Tailwind 的 utility 色（`bg-brand`、`text-text-primary` 等）。
- 可重用的 class 元件：`.btn-primary`、`.btn-secondary`、`.btn-ghost`、`.card`、`.label`、`.input`、`.badge`。建構新 UI 時**請優先使用這些**，不要堆一坨 ad-hoc class。
- 元件內的顏色值使用 `bg-[--color-surface]` 這種 arbitrary-value 語法直接引用 CSS 變數。

字型預設為 `'Noto Sans TC'`（繁體中文用）；UI 文案全部是 zh-Hant。

## 部署

**前端**：舊 GitHub Pages workflow 已於 2026-04-21 退役，新部署平台遷移計畫待定。

**後端**：NestJS 尚未部署至雲端；僅於本地開發，透過 Cloudflare Tunnel 對外公開（見上節）。

## 雷區

- `apps/api/prisma/schema.prisma` 動過任何 model 或 enum，記得 `pnpm prisma:generate` 後再 build，否則 `@prisma/client` 型別不會同步。
- `packages/shared` 動過任何 export 後，下游（web / api）要重新 build `shared` 才拿得到新型別（或開 `pnpm dev:shared` watch 模式）。
- 改 `DashboardService` 邏輯時，cache 可能讓你測到舊資料：重啟 api server，或打 `POST /api/admin/refresh-data` 清。
- `IssueLite.labels[].name` 保證非空；當 GitHub 回傳字串型 label 時，`color` 預設為 `'888888'`（6-hex 無 `#`）。
- `Milestone.completion` 對空 milestone 回傳 `0`（不是 `null`），下游元件依賴此保證。
- `computeCompletion` 邏輯在後端 `DashboardService` 與前端 `apps/web/src/utils/progress.ts` 各有一份實作，邊界行為必須一致。
