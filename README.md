# Zenbu Milestones

pnpm monorepo：視覺化呈現 [`zenbuapps`](https://github.com/zenbuapps) GitHub 組織底下所有 repo 的 milestones 與 issues，並提供訪客投稿 issue → admin 審核 → 轉發至 GitHub 的工作流程。

> **狀態**：舊 GitHub Pages 靜態部署已於 2026-04-21 退役，前端部署平台遷移計畫待定。詳見下方「部署」段落。

## 技術堆疊

| 層 | 技術 |
|---|---|
| **前端** (`apps/web`) | Vite 5 + React 18 + TypeScript + Tailwind CSS 3 + react-router-dom v6 |
| **後端** (`apps/api`) | NestJS 11 + Prisma 5 + PostgreSQL + Passport (Google OAuth) + express-session |
| **共用** (`packages/shared`) | tsup（ESM + CJS + `.d.ts` 三吃）|
| **資料源** | GitHub REST API（`@octokit/rest` v21）|

## 快速開始

本專案使用 **pnpm**（版本由 `package.json::packageManager` 鎖定）。請勿使用 `npm install` 或 `yarn`。

```bash
pnpm install
cp .env.example .env      # 填入必要值（見下方「環境變數」）
pnpm dev:all              # 前端 + 後端 + shared watch 一起跑
```

### 指令一覽

| 指令 | 說明 |
|---|---|
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
| `pnpm fetch-data` | （過渡期）執行舊靜態 fetcher，需 `GH_TOKEN` |

本專案**沒有 lint 設定、沒有測試框架**。`tsc --noEmit` 是唯一的靜態檢查手段。

### 環境變數

複製 `.env.example` 為 `.env` 並填入必要值。主要設定項：

| 變數 | 用途 |
|---|---|
| `DATABASE_URL` | PostgreSQL 連線字串（Prisma 使用） |
| `SESSION_SECRET` | express-session 簽章 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `VITE_API_BASE_URL` | 前端呼叫後端的 base URL，預設 `http://localhost:3000` |
| `PORT` | 後端 NestJS 監聽 port，預設 `3000` |
| `GH_TOKEN` | 過渡期 `pnpm fetch-data` 需要，fine-grained PAT（`zenbuapps` org / contents + issues + metadata 唯讀）|

## 架構概覽

### 三個 workspace

```
zenbu-milestones/
├── apps/
│   ├── web/       # Vite SPA
│   └── api/       # NestJS backend
└── packages/
    └── shared/    # 共用 DTO / 型別
```

`apps/web` 與 `apps/api` 都 `import from 'shared'`。`shared` 必須先 build，下游才能解析型別（`pnpm build` 已寫死正確順序）。

### 資料源（過渡期雙軌）

目前兩條資料路徑並存：

1. **舊靜態管線**（逐步退役中）
   - `apps/web/scripts/fetch-data.ts` 於本機執行，輸出 `apps/web/public/data/*.json`
   - `apps/web/src/data/loader.ts` 讀上述 JSON
   - `AppShell` / `RoadmapPage` 仍透過此路徑取 summary / repo detail

2. **新後端 API**
   - `apps/web/src/data/api.ts` ↔ NestJS（`apps/api`）
   - 已上線：auth、issue submission、admin review、image upload、repo settings
   - 待補：`/api/summary`、`/api/repos/:name/detail`（完成後舊管線即可退役）

**契約檔案**：`apps/web/src/data/types.ts` 是 fetcher / loader 與 SPA 之間的共享介面。改動任一欄位需同步更新兩端（詳見 `.claude/rules/data-contract.rule.md`）。

### 路由

`apps/web/src/App.tsx` 使用 `HashRouter`（舊 GitHub Pages 部署遺留）：

- `/` → `OverviewPage`（所有 repo）
- `#/repo/:name` → `RoadmapPage`（單一 repo 的 milestone / issue）

新部署平台確定後可改回 `BrowserRouter`。

## 本地後端公開存取（Cloudflare Tunnel）

如需讓本機後端（`localhost:3000`）被外部存取（OAuth callback、webhook 測試等），已預先設定 Cloudflare Tunnel：

| 項目 | 值 |
|---|---|
| 公開 URL | <https://local-milestones.powerhouse.tw> |
| 指向本地 | `http://localhost:3000` |
| Tunnel 名稱 | `turbo-local` |
| Tunnel UUID | `fdf28065-c202-42d4-89dd-0440dd18cefd` |
| Config 路徑 | `%USERPROFILE%\.cloudflared\config.yml` |

### 啟動 tunnel

```powershell
cloudflared tunnel run turbo-local
```

啟動後，任何送往 `https://local-milestones.powerhouse.tw` 的請求會經由 Cloudflare edge 轉發至本機 `localhost:3000`。若後端尚未啟動會收到 HTTP 502（預期行為）。

### 修改 ingress 後重啟

編輯 `%USERPROFILE%\.cloudflared\config.yml` 新增或調整 ingress 規則後：

```powershell
Stop-Process -Name cloudflared -Force
cloudflared tunnel run turbo-local
```

### 新增 hostname

```bash
cloudflared tunnel route dns turbo-local <new-hostname>.powerhouse.tw
```

上述指令會自動在 Cloudflare `powerhouse.tw` zone 建立 CNAME 指向 tunnel。完成後再到 `config.yml` 加入對應 ingress 規則並重啟 cloudflared。

### 命名限制

**Hostname 必須為單層子網域**（如 `local-milestones.powerhouse.tw`），**不可使用多層**（如 `local.milestones.powerhouse.tw`）。Cloudflare Universal SSL 僅涵蓋 `*.powerhouse.tw` 單層通配，雙層子網域在 TLS handshake 階段會失敗。沿用 dash 連接的慣例以確保 SSL 涵蓋。

## 部署

### 前端（待定）

舊 `.github/workflows/build-and-deploy.yml` 已於 2026-04-21 退役，不再自動部署至 GitHub Pages。新平台遷移計畫待定，候選：

- Vercel
- Cloudflare Pages
- 其他（自架 Nginx / S3 + CloudFront 等）

遷移時要同步處理：
- `vite.config.ts::base`（目前已回到預設 `/`，若部署到 sub-path 要重設）
- `apps/web/src/App.tsx` 的路由器（`HashRouter` → `BrowserRouter`，若新平台支援 SPA fallback）
- 環境變數注入（`VITE_API_BASE_URL`）

### 後端（待定）

NestJS 尚未部署至雲端，僅本地開發 + Cloudflare Tunnel 對外。候選平台：Railway / Render / Fly.io / 自架 VPS。

## 專案文件

- [`.claude/CLAUDE.md`](./.claude/CLAUDE.md) — 專案總綱（30 秒上手）
- [`.claude/rules/data-contract.rule.md`](./.claude/rules/data-contract.rule.md) — `types.ts` / fetcher 契約變更流程
- [`.claude/rules/styling-system.rule.md`](./.claude/rules/styling-system.rule.md) — Tailwind + CSS token 設計系統
- [`.claude/rules/pnpm-and-ci.rule.md`](./.claude/rules/pnpm-and-ci.rule.md) — pnpm 使用、依賴升級節奏
- [`specs/`](./specs) — 資料管線 / JSON schema / 資訊架構 / visitor issue submission 的穩定契約

## 雷區摘要

- `packages/shared` 動過任何 export 後，下游（web / api）要重新 build shared 才拿得到新型別（或開 `pnpm dev:shared` watch 模式）。
- `apps/api/prisma/schema.prisma` 動過 model 或 enum 後，記得先 `pnpm prisma:generate` 再 build，否則 `@prisma/client` 型別不會同步。
- `Milestone.completion` 對空 milestone 回傳 `0`（不是 `null`），下游元件依賴此保證。
- `IssueLite.labels[].name` 保證非空（fetcher 已過濾）；`color` 為 6 位 hex（無 `#`）。
- Cloudflare Tunnel hostname 限制：**單層子網域**（見上節）。
