# CLAUDE.md

本檔案為 Claude Code（claude.ai/code）在本 repo 中工作時的指引。作為專案總綱（30 秒上手），細節規範依任務類型讀下列檔案：

- `.claude/skills/zenbu-milestones-dashboard/SKILL.md` — 專案架構索引（依任務類型路由到對應 rule）
- `.claude/rules/data-contract.rule.md` — 改 `types.ts` / fetcher 產出形狀時
- `.claude/rules/styling-system.rule.md` — 新增 UI、配色、圖示時
- `.claude/rules/pnpm-and-ci.rule.md` — 動依賴、workspace 建置順序時
- `specs/` — 資料管線 / JSON schema / 資訊架構 的穩定契約
- `.claude/skills/{octokit-rest-v21,react-router-v6,tailwindcss-v3,zenbuapps-design-system}/` — 第三方 library / 設計系統 skill

## 專案是什麼

**pnpm monorepo**，視覺化呈現 `zenbuapps` GitHub 組織下所有 repo 的 milestones 與 issues，並接受訪客投稿 issue 的工作流程：

```
apps/
  ├─ web/   Vite + React 18 + TypeScript — 前端 SPA
  └─ api/   NestJS 11 + Prisma 5 + PostgreSQL — 後端 API（auth / issue submission / admin）
packages/
  └─ shared/  共用 DTO 型別（tsup 產 ESM + CJS + d.ts）
```

### 過渡期狀態（2026-04-21 起）

- 舊靜態管線（`apps/web/scripts/fetch-data.ts` → `public/data/*.json` → `src/data/loader.ts`）**仍在運作**，為過去 GitHub Pages 部署遺留
- 新架構以後端 API 為資料源（見 `apps/web/src/data/api.ts`），逐步接手 summary / repo detail 讀取
- **GitHub Actions 每小時 cron 部署已退役**（workflow 刪除、CI secret 停用）
- 前端部署平台遷移待定（Vercel / Cloudflare Pages / 其他）

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

# 過渡期指令（即將退役）
pnpm fetch-data        # 跑 apps/web/scripts/fetch-data.ts，需 GH_TOKEN
pnpm preview           # apps/web 的 vite preview
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

## 架構：兩階段資料管線（過渡期）

### Stage 1（退役中） —— build-time fetcher（`apps/web/scripts/fetch-data.ts`）

使用 `@octokit/rest` 搭配兩個 `p-limit` 池（`repoLimit=5`、`issueLimit=8`）以避開 GitHub 的 secondary rate limit。寫出：

- `apps/web/public/data/summary.json` —— `Summary`（總計值 + 各 repo 的 `RepoSummary[]`，排序規則：有 milestone 的在前，然後依字母序）
- `apps/web/public/data/repos.json` —— 單獨的 `RepoSummary[]`
- `apps/web/public/data/repos/{name}.json` —— 每個 repo 的 `RepoDetail`

會過濾掉 archived / fork 的 repo、PR 類型的 issue，以及任何帶有 `SENSITIVE_LABELS` 標籤的 issue（`confidential`、`security`、`internal-only`）。

整個 `apps/web/public/data/` 樹被 `.gitignore` 掉了 —— 它只在 fetch 之後存在。

### Stage 2 —— runtime loader（`apps/web/src/data/loader.ts`）

- `loadSummary()` / `loadRepoDetail(name)` 是僅有的兩個進入點（仍被 `AppShell` / `RoadmapPage` 使用中）
- 記憶體內的 `Map` 快取可避免同一個 session 內重複 fetch
- URL 透過 `import.meta.env.BASE_URL` 組出
- 所有 JSON 形狀都定義在 `apps/web/src/data/types.ts` —— **那支檔案是 fetcher 與 SPA 之間共用的契約**

### 新主線 —— 後端 API（`apps/web/src/data/api.ts` ↔ `apps/api`）

- 走 `VITE_API_BASE_URL` 指向的 NestJS 後端，攜帶 session cookie
- 回傳 envelope：`{ success: true, data: T }` 或 `{ success: false, error }`
- 目前已上線：auth（Google OAuth）、issue submission、admin review、image upload、repo settings
- **待補**：`/api/summary` 與 `/api/repos/:name/detail`，取代 Stage 1/2 的靜態 JSON 管線

### 路由

`apps/web/src/App.tsx` 目前使用 **`HashRouter`**（舊 GitHub Pages 部署遺留，靜態檔案伺服器無 SPA fallback）。兩條路由：

- `/` → `OverviewPage`（所有 repo）
- `#/repo/:name` → `RoadmapPage`（單一 repo 的 milestone / issue）

**遷移至新部署平台後**：若新平台支援 SPA fallback（Vercel / Cloudflare Pages 皆有），可改回 `BrowserRouter`。此改動牽動所有既有深層連結，建議與平台遷移同步處理。

`AppShell` 會載入一次 `summary.json`，處理 loading / error 狀態，並透過 `Outlet context`（`TAppShellContext`）把結果傳給子元件。

## 樣式規範

Tailwind 3 + 一套小型的 CSS custom-property 設計系統（在 `apps/web/src/styles/globals.css`）：

- 顏色以 `--color-*` CSS 變數定義（`--color-brand`、`--color-surface`、`--color-text-*`，以及語意色 `--color-error|success|warning`）。`tailwind.config.js` 會把它們暴露成 Tailwind 的 utility 色（`bg-brand`、`text-text-primary` 等）。
- 可重用的 class 元件：`.btn-primary`、`.btn-secondary`、`.btn-ghost`、`.card`、`.label`、`.input`、`.badge`。建構新 UI 時**請優先使用這些**，不要堆一坨 ad-hoc class。
- 元件內的顏色值使用 `bg-[--color-surface]` 這種 arbitrary-value 語法直接引用 CSS 變數。

字型預設為 `'Noto Sans TC'`（繁體中文用）；UI 文案全部是 zh-Hant。

## 部署

**前端**：舊 GitHub Pages workflow 已於 2026-04-21 退役，新部署平台遷移計畫待定（Vercel / Cloudflare Pages / 其他）。

**後端**：NestJS 尚未部署至雲端；僅於本地開發，透過 Cloudflare Tunnel 對外公開（見上節）。

## 雷區

- `apps/web/src/data/loader.ts` 的 `resolveDataUrl` 透過 `import.meta.env.BASE_URL` 組路徑。`base` 目前在 `vite.config.ts` 中已移除（回預設 `/`）；未來若部署到 sub-path（例如自架 Nginx 放 `/dashboard/`），要同時設 `vite.config.ts::base` 與 `apps/web/index.html` 的 favicon href。
- `apps/api/prisma/schema.prisma` 動過任何 model 或 enum，記得 `pnpm prisma:generate` 後再 `pnpm build`，否則 `@prisma/client` 型別不會同步。
- `scripts/tsconfig.json`（在 `apps/web/scripts/`）是獨立的專案設定（target Node），跟 `tsconfig.app.json`（target 瀏覽器）不同。`pnpm build:web` 會透過 `tsc -b` 一次檢查兩邊。
- `IssueLite` 的 `labels` 保證 `name` 非空（fetcher 已過濾）；當 GitHub 回傳字串型 label 時，`color` 預設為 `'888888'`。
- `Milestone` 的 `completion` 是 `closedIssues / (openIssues + closedIssues)`，對空的 milestone 會回傳 `0` —— 不是 `null`。
- `packages/shared` 動過任何 export 後，下游（web / api）要重新 build `shared` 才拿得到新型別（或開 `pnpm dev:shared` watch 模式）。
