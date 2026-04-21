# Zenbu Milestones Dashboard

靜態儀表板（Vite + React 18 + TypeScript），視覺化呈現 [`zenbuapps`](https://github.com/zenbuapps) GitHub 組織底下所有 repo 的 milestones 與 issues。

線上網址：<https://zenbuapps.github.io/zenbu-milestones/>

## 技術堆疊

- **前端**：Vite 5 + React 18 + TypeScript + Tailwind CSS 3
- **路由**：`react-router-dom` v6（`HashRouter`，配合 GitHub Pages 靜態部署）
- **資料源**：GitHub REST API（`@octokit/rest` v21）
- **資料管線**：build-time fetcher → 靜態 JSON → runtime loader（無 runtime API server）
- **部署**：GitHub Actions（每小時 cron + push to `master` + 手動 dispatch）

## 快速開始

本專案使用 **pnpm**（版本由 `package.json::packageManager` 鎖定）。請勿使用 `npm install` 或 `yarn`。

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

### 指令一覽

| 指令 | 說明 |
|---|---|
| `pnpm install` | 安裝相依套件 |
| `pnpm dev` | Vite 開發伺服器（port 5173）|
| `pnpm build` | `tsc -b` 型別檢查 + `vite build` → `dist/` |
| `pnpm preview` | 本地預覽 production build |
| `pnpm typecheck` | `tsc -b --noEmit`（靜態型別檢查） |
| `pnpm fetch-data` | 執行 `scripts/fetch-data.ts`（需 `GH_TOKEN` 環境變數）|

本專案**沒有 lint 設定、沒有測試框架**。`tsc -b` 是唯一的靜態檢查手段。

### 環境變數

複製 `.env.example` 為 `.env` 並填入必要值：

```bash
cp .env.example .env
```

主要設定項：

| 變數 | 用途 |
|---|---|
| `PORT` | 本地後端（NestJS）監聽 port，預設 `3000` |
| `API_BASE_URL` | 前端呼叫後端的 base URL，預設 `http://localhost:3000` |
| `GH_TOKEN` | 執行 `pnpm fetch-data` 時需要，fine-grained PAT 對 `zenbuapps` org 有 contents/issues/metadata 唯讀 |

## 架構概覽

### 兩階段資料管線

```
┌────────────────────────────┐        ┌──────────────────────┐
│ Stage 1: build-time        │        │ Stage 2: runtime     │
│                            │        │                      │
│ scripts/fetch-data.ts      │ writes │ src/data/loader.ts   │
│   ─ @octokit/rest          │───────▶│   ─ fetch() JSON     │
│   ─ p-limit (rate limit)   │  JSON  │   ─ in-memory cache  │
│   ─ filter sensitive       │        │                      │
└────────────────────────────┘        └──────────────────────┘
        │                                        │
        ▼                                        ▼
   public/data/                            SPA 元件消費
   ├─ summary.json                         （依 types.ts 契約）
   ├─ repos.json
   └─ repos/{name}.json
```

- **Stage 1**：跑在 GitHub Actions（或本地以 `GH_TOKEN=xxx pnpm fetch-data` 執行）。抓取、過濾（排除 archived/fork、PR 類型、以及帶有 `SENSITIVE_LABELS` 的 issue），輸出靜態 JSON 至 `public/data/`。
- **Stage 2**：SPA 啟動後透過 `loadSummary()` / `loadRepoDetail(name)` 讀取上述 JSON，不走任何 runtime API。

**契約檔案**：`src/data/types.ts` 是 fetcher 與 SPA 之間的共享介面，改動任一欄位需同步更新兩端。

### 路由

`src/App.tsx` 使用 `HashRouter`（GitHub Pages 只能提供靜態檔案，`BrowserRouter` 在深層連結會 404）：

- `/` → `OverviewPage`（所有 repo）
- `#/repo/:name` → `RoadmapPage`（單一 repo 的 milestone / issue）

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

部署流程定義於 `.github/workflows/build-and-deploy.yml`：

- **觸發條件**：每小時整點 cron（`0 * * * *` UTC）、push 到 `master`、手動 `workflow_dispatch`
- **必要 Secret**：`ZENBU_ORG_READ_TOKEN`（fine-grained PAT，對 `zenbuapps` 組織的 contents / issues / metadata 有唯讀權限）
- **目標**：GitHub Pages，路徑 `/zenbu-milestones/`
- **並發控制**：`concurrency: pages` + `cancel-in-progress: false`，排程不互踩

完整部署規範見 [`.claude/rules/pnpm-and-ci.rule.md`](./.claude/rules/pnpm-and-ci.rule.md)。

## 專案文件

- [`.claude/CLAUDE.md`](./.claude/CLAUDE.md) — 專案總綱（30 秒上手）
- [`.claude/rules/data-contract.rule.md`](./.claude/rules/data-contract.rule.md) — `types.ts` / fetcher 契約變更流程
- [`.claude/rules/vite-base-path.rule.md`](./.claude/rules/vite-base-path.rule.md) — URL / 路由 / 靜態資源路徑規範
- [`.claude/rules/styling-system.rule.md`](./.claude/rules/styling-system.rule.md) — Tailwind + CSS token 設計系統
- [`.claude/rules/pnpm-and-ci.rule.md`](./.claude/rules/pnpm-and-ci.rule.md) — pnpm 使用、CI workflow、Secret 管理
- [`specs/`](./specs) — 資料管線 / JSON schema / 部署 / 資訊架構的穩定契約

## 雷區摘要

- 程式碼中**絕對不要** hard-code `/zenbu-milestones/` —— 一律透過 `import.meta.env.BASE_URL`。
- `vite.config.ts` 的 `base` 必須與 GitHub Pages repo 名稱同步；重新命名 repo 時也要改 `index.html` 的 favicon href。
- Cloudflare Tunnel hostname 限制：**單層子網域**（見上節）。
- `Milestone.completion` 對空 milestone 回傳 `0`（不是 `null`），下游元件依賴此保證。
- `IssueLite.labels[].name` 保證非空（fetcher 已過濾）；`color` 為 6 位 hex（無 `#`）。
