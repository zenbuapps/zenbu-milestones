# 開發與部署指南

本文件為 Zenbu Roadmaps 的技術細節與貢獻指南，包含本地開發環境設定、架構說明、環境變數、部署指引等。如果你只是想了解此服務的功能與使用流程，請看 [README.md](./README.md)。

---

## 目錄

- [技術堆疊](#技術堆疊)
- [快速開始（本地開發）](#快速開始本地開發)
- [指令一覽](#指令一覽)
- [環境變數](#環境變數)
- [本機 dev-login（繞過 Google OAuth）](#本機-dev-login繞過-google-oauth)
- [架構概覽](#架構概覽)
- [本地後端公開存取（Cloudflare Tunnel）](#本地後端公開存取cloudflare-tunnel)
- [部署](#部署)
- [專案文件](#專案文件)
- [雷區摘要](#雷區摘要)

---

## 技術堆疊

| 層 | 技術 |
| --- | --- |
| **前端** (`apps/web`) | Vite 5 + React 18 + TypeScript + Tailwind CSS 3 + react-router-dom v6 (HashRouter) |
| **後端** (`apps/api`) | NestJS 11 + Prisma 5 + PostgreSQL + Passport (Google OAuth) + express-session |
| **共用** (`packages/shared`) | tsup（ESM + CJS + `.d.ts` 三吃） |
| **資料源** | GitHub REST API（`@octokit/rest` v21），由後端 `DashboardModule` 代呼 |

---

## 快速開始（本地開發）

本專案使用 **pnpm**（版本由 `package.json::packageManager` 鎖定為 `pnpm@10.32.1`）。請勿使用 `npm install` 或 `yarn`。

```bash
# 1. 安裝相依
pnpm install

# 2. 起一個本地 PostgreSQL（建議獨立容器避開 5432 衝突）
docker run -d --name zenbu-roadmaps-postgres \
  -p 5433:5432 \
  -e POSTGRES_PASSWORD=dev \
  -e POSTGRES_DB=zenbu_roadmaps \
  postgres:16-alpine

# 3. 設定環境變數（見下方「環境變數」段落）
cp .env.example .env
# 編輯 .env 至少填入 DATABASE_URL=postgresql://postgres:dev@localhost:5433/zenbu_roadmaps
#                  以及 SESSION_SECRET / ZENBU_ORG_WRITE_TOKEN

# 4. 跑 Prisma migration
pnpm prisma:migrate:dev

# 5. 三個 workspace 一起跑
pnpm dev:all
```

跑起來後：

- 前端 <http://localhost:5173>
- 後端 <http://localhost:3000>

---

## 指令一覽

| 指令 | 說明 |
| --- | --- |
| `pnpm install` | 安裝所有 workspace 相依 |
| `pnpm dev:web` | 前端 Vite 開發伺服器（port 5173） |
| `pnpm dev:api` | 後端 NestJS watch 模式（port 3000） |
| `pnpm dev:shared` | `packages/shared` 的 tsup watch |
| `pnpm dev:all` | 三個一起跑（`-r --parallel`） |
| `pnpm build` | 先 `shared`、再平行打 `web` + `api` |
| `pnpm build:shared` / `build:web` / `build:api` | 個別打包 |
| `pnpm typecheck` | 所有 workspace 的 `tsc --noEmit` |
| `pnpm preview` | `apps/web` 的 production preview |
| `pnpm prisma:generate` | 生成 `@prisma/client` |
| `pnpm prisma:migrate:dev` | 開發環境 migration |

本專案**沒有 lint 設定、沒有測試框架**。`tsc --noEmit` 是唯一的靜態檢查手段。

---

## 環境變數

複製 `.env.example` 為 `.env` 並填入必要值。後端使用 `@nestjs/config` 讀根目錄 `.env`；前端 Vite 讀 `apps/web/.env.local`（或從根 `.env` 取 `VITE_` 前綴變數）。

### 後端必要變數

| 變數 | 用途 |
| --- | --- |
| `NODE_ENV` | `development` / `production` / `test` |
| `PORT` | 後端 NestJS 監聽 port，預設 `3000` |
| `APP_BASE_URL` | 前端公開 URL（OAuth callback 回導用），預設 `http://localhost:5173` |
| `DATABASE_URL` | PostgreSQL 連線字串 |
| `SESSION_SECRET` | express-session 簽章（≥ 32 byte 隨機字串） |
| `SESSION_COOKIE_SECURE` | 生產環境必為 `true`，開發 `false` |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` / `GOOGLE_OAUTH_CALLBACK_URL` | Google OAuth 2.0 |
| `GITHUB_ORG` | 預設 `zenbuapps` |
| `ZENBU_ORG_WRITE_TOKEN` | Fine-grained PAT（`zenbuapps` org / Contents + Issues + Metadata Read & Write）；後端代建 issue + dashboard 抓資料用 |
| `INITIAL_ADMIN_EMAILS` | 逗號分隔的 email 清單；首次登入時 email 在此清單者自動授 `role=admin` |
| `CORS_ALLOWED_ORIGINS` | 允許的前端 origin（逗號分隔） |
| `BUNNY_*` | Bunny CDN 圖片上傳設定（投稿附圖用） |

### 前端變數

| 變數 | 用途 |
| --- | --- |
| `VITE_API_BASE_URL` | 後端 API 的公開 URL，預設 `http://localhost:3000` |

> **警告**：任何 secret **絕對不可有 `VITE_` 前綴**，否則會被打包進前端 bundle 外洩。

---

## 本機 dev-login（繞過 Google OAuth）

本地開發時不需要真的跑完 Google OAuth flow。後端 `AuthController` 提供 dev-only bypass endpoint，**僅在 `NODE_ENV=development` 開放**（其他環境一律 403）：

```
GET http://localhost:3000/api/auth/dev-login?email=you@example.com
```

### 流程

1. 直接在瀏覽器打開上述 URL → 看到 `{"success":true,"data":{...}}`，cookie 已寫入 `localhost:3000` domain
2. 開 <http://localhost:5173/> → `RequireAuthGate` 會放行
3. 若該 email 列在 `INITIAL_ADMIN_EMAILS`，自動授 `role=admin`

### 前置條件（缺一不可，否則後端 boot 或 dev-login 會失敗）

- `NODE_ENV=development`
- `SESSION_SECRET` 任意值
- `DATABASE_URL` 連得上 PostgreSQL（且 Prisma migration 已跑過）
- `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` / `GOOGLE_OAUTH_CALLBACK_URL`（可填 placeholder，dev-login 不會用到，但 NestJS boot 時 Passport strategy 註冊需要它們存在）
- `ZENBU_ORG_WRITE_TOKEN` 非空字串（dev-login 不會用 PAT，但 NestJS boot 需要它存在）
- `CORS_ALLOWED_ORIGINS=http://localhost:5173`
- `pnpm dev:api` 在跑

詳見 [`.claude/CLAUDE.md`](./.claude/CLAUDE.md)。

> **注意**：用 dev-login 進去後，Dashboard 仍會打 GitHub API；若 PAT 是 placeholder，`/api/summary` 等 endpoint 會失敗。要看真實資料請把 `ZENBU_ORG_WRITE_TOKEN` 換成真 PAT 後重啟 dev:api。

---

## 架構概覽

### 三個 workspace

```
zenbu-roadmaps/
├── apps/
│   ├── web/       # Vite SPA
│   └── api/       # NestJS backend
└── packages/
    └── shared/    # 共用 DTO / 型別
```

`apps/web` 與 `apps/api` 都 `import from 'shared'`。`shared` 必須先 build，下游才能解析型別（`pnpm build` 已寫死正確順序）。動過 `packages/shared` 的程式碼，要跑 `pnpm build:shared`（或開 `pnpm dev:shared` watch 模式），下游 workspace 才拿得到新型別。

### 資料源：DashboardModule

實作於 `apps/api/src/dashboard/`：

- **`DashboardService`** — 用 `GithubService` 抓 org / repos / roadmaps / issues；`createLimiter` 控制併發；`SENSITIVE_LABELS` 過濾敏感 issue；輸出 shape 對齊 shared DTO
- **`DashboardCacheService`** — in-memory TTL map（5 分鐘），支援 prefix 批次清除
- **HTTP layer** — `dashboard.controller.ts` / `admin-dashboard.controller.ts` / `github-health.controller.ts`，全部套 `AuthenticatedGuard`，admin endpoints 再加 `AdminGuard`

**Cache keys**：

```
dashboard:summary
dashboard:repo:{owner}/{name}
dashboard:roadmap-issues:{owner}/{name}/{number}:p{page}:s{perPage}
```

`POST /api/admin/refresh-data` 清所有 `dashboard:` prefix，10 秒 debounce 防呆。

**前端 client**：`apps/web/src/data/api.ts` 的 `fetchSummary` / `fetchRepoDetail` / `fetchRoadmapIssues` / `refreshAdminData` / `fetchGithubHealth`，全走 `shared` 的 `API_PATHS` 常數（無 hardcode URL）。

### 共用契約

[`packages/shared/src/index.ts`](./packages/shared/src/index.ts) 最底下兩個 section（Dashboard data + Phase 2）定義 `Summary` / `RepoDetail` / `Roadmap` / `IssueLite` 等型別，是後端產出與前端消費的唯一事實來源。改動任一欄位需同步三端（shared / api / web），詳見 [`.claude/rules/data-contract.rule.md`](./.claude/rules/data-contract.rule.md)。

### 路由與登入

`apps/web/src/App.tsx` 使用 `HashRouter`（舊 GitHub Pages 部署遺留）。主要路由：

- `/` → `OverviewPage`（所有 repo 總覽）
- `#/repo/:name` → `RoadmapPage`（單一 repo 的 roadmap / issue）
- `#/me/issues` → `MyIssuesPage`（投稿者追蹤自己的 issue）
- `#/admin?tab=...` → `AdminPage`（管理員後台）

**所有頁面都需登入**才能瀏覽。未登入時 `AppShell` / `RoadmapPage` 會掛 `<RequireAuthGate />`（全螢幕登入提示 + Google 登入按鈕）。

新部署平台確定後可改回 `BrowserRouter`（與平台遷移同步處理）。

---

## 本地後端公開存取（Cloudflare Tunnel）

如需讓本機後端（`localhost:3000`）被外部存取（OAuth callback 整合測試、webhook 等），已預先設定 Cloudflare Tunnel 對外公開為 `https://local-roadmaps.powerhouse.tw`：

| 項目 | 值 |
| --- | --- |
| 公開 URL | <https://local-roadmaps.powerhouse.tw> |
| 指向本地 | `http://localhost:3000` |
| Tunnel 名稱 | `turbo-local` |
| Tunnel UUID | `fdf28065-c202-42d4-89dd-0440dd18cefd` |
| Config 路徑 | `%USERPROFILE%\.cloudflared\config.yml` |

此 tunnel 與 `local-turbo.powerhouse.tw`、`local-test.powerhouse.tw` 共用同一個 `turbo-local` tunnel，ingress 規則集中於同一份 `config.yml`（這也是為何修改 config 後需重啟整個 `cloudflared`）。

### 啟動 tunnel

```powershell
cloudflared tunnel run turbo-local
```

啟動後，送往 `https://local-roadmaps.powerhouse.tw` 的請求會經 Cloudflare edge 轉發至本機 `localhost:3000`。後端尚未啟動時收到 HTTP 502 為預期行為。

### 修改 ingress 後重啟

編輯 `%USERPROFILE%\.cloudflared\config.yml` 後：

```powershell
Stop-Process -Name cloudflared -Force
cloudflared tunnel run turbo-local
```

### 新增 hostname

```bash
cloudflared tunnel route dns turbo-local <new-hostname>.powerhouse.tw
```

此指令會在 Cloudflare `powerhouse.tw` zone 自動建立 CNAME 指向 tunnel。完成後再到 `config.yml` 加入對應 ingress 規則並重啟 cloudflared。

### 命名限制

**Hostname 必須為單層子網域**（如 `local-roadmaps.powerhouse.tw`），**不可使用多層**（如 `local.roadmaps.powerhouse.tw`）。Cloudflare Universal SSL 僅涵蓋 `*.powerhouse.tw` 單層通配，雙層子網域在 TLS handshake 階段會失敗。沿用 dash 連接的慣例以確保 SSL 涵蓋。

---

## 部署

### 前端

舊 `.github/workflows/build-and-deploy.yml` 已於 2026-04-21 退役，不再自動部署至 GitHub Pages。新平台候選：

- Vercel
- Cloudflare Pages
- 其他（自架 Nginx / S3 + CloudFront 等）

遷移時需同步處理：

- `vite.config.ts::base`（目前已回到預設 `/`，若部署到 sub-path 要重設）
- `apps/web/src/App.tsx` 的路由器（`HashRouter` → `BrowserRouter`，前提：新平台支援 SPA fallback）
- 環境變數注入（`VITE_API_BASE_URL`）

### 後端

NestJS 尚未部署至雲端，僅本地開發 + Cloudflare Tunnel 對外。候選平台：Railway / Render / Fly.io / 自架 VPS。部署時需設定：

- `NODE_ENV=production`
- `SESSION_COOKIE_SECURE=true`
- `CORS_ALLOWED_ORIGINS` 加入正式前端 URL
- `GOOGLE_OAUTH_CALLBACK_URL` 改為正式 domain

---

## 專案文件

- [`.claude/CLAUDE.md`](./.claude/CLAUDE.md) — 專案總綱（30 秒上手）
- [`.claude/skills/zenbu-roadmaps-dashboard/SKILL.md`](./.claude/skills/zenbu-roadmaps-dashboard/SKILL.md) — 專案架構索引（依任務類型路由到對應 rule）
- [`.claude/rules/data-contract.rule.md`](./.claude/rules/data-contract.rule.md) — shared DTO / dashboard service 契約變更流程
- [`.claude/rules/styling-system.rule.md`](./.claude/rules/styling-system.rule.md) — Tailwind 3 + CSS token 設計系統
- [`.claude/rules/pnpm-and-ci.rule.md`](./.claude/rules/pnpm-and-ci.rule.md) — pnpm 使用、依賴升級節奏
- [`specs/`](./specs) — 資料管線 / JSON schema / 資訊架構 / visitor issue submission 的穩定契約

---

## 雷區摘要

- `packages/shared` 動過任何 export 後，下游（web / api）要重新 build shared 才拿得到新型別（或開 `pnpm dev:shared` watch 模式）。
- `apps/api/prisma/schema.prisma` 動過 model 或 enum 後，記得先 `pnpm prisma:generate` 再 build，否則 `@prisma/client` 型別不會同步。
- 改 `DashboardService` 邏輯時，cache 可能讓你測到舊資料：重啟 api server，或打 `POST /api/admin/refresh-data` 清。
- `Roadmap.completion` 對空 roadmap 回傳 `0`（不是 `null`），下游元件依賴此保證。
- `computeCompletion` 邏輯在後端 `DashboardService` 與前端 `apps/web/src/utils/progress.ts` 各有一份實作，邊界行為必須一致。
- `IssueLite.labels[].name` 保證非空（後端 `toIssueLite` 已過濾）；`color` 為 6 位 hex（無 `#`），字串型 label 預設 `'888888'`。
- Cloudflare Tunnel hostname 限制：**單層子網域**（見上節）。
- dev-login bypass endpoint 硬擋 `NODE_ENV !== 'development'` → 403，但仍應確保生產環境 `NODE_ENV` 設定正確。
