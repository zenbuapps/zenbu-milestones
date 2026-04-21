# CLAUDE.md

本檔案為 Claude Code（claude.ai/code）在本 repo 中工作時的指引。作為專案總綱（30 秒上手），細節規範依任務類型讀下列檔案：

- `.claude/skills/zenbu-milestones-dashboard/SKILL.md` — 專案架構索引（依任務類型路由到對應 rule）
- `.claude/rules/data-contract.rule.md` — 改 `types.ts` / fetcher 產出形狀時
- `.claude/rules/vite-base-path.rule.md` — 動 URL / 路由 / 靜態資源路徑時
- `.claude/rules/styling-system.rule.md` — 新增 UI、配色、圖示時
- `.claude/rules/pnpm-and-ci.rule.md` — 動依賴、workflow、PAT 時
- `specs/` — 資料管線 / JSON schema / 部署 / 資訊架構 的穩定契約
- `.claude/skills/{octokit-rest-v21,react-router-v6,tailwindcss-v3,zenbuapps-design-system}/` — 第三方 library / 設計系統 skill

## 專案是什麼

一個**靜態儀表板**（Vite + React 18 + TypeScript），用來視覺化呈現 `zenbuapps` GitHub 組織下所有 repo 的 milestones 與 issues。部署到 GitHub Pages 的 `/zenbu-milestones/` 路徑。

**沒有 runtime API**。所有 GitHub 資料都在 **build time** 由 `scripts/fetch-data.ts` 抓取，序列化為靜態 JSON 放到 `public/data/`，SPA 端透過 `fetch()` 直接讀取這些檔案。

## 指令

本專案使用 **pnpm**（`packageManager` 欄位鎖定版本）。`package-lock.json` 已移除，請勿使用 `npm install` 或 `yarn`。

```bash
pnpm install         # 安裝相依套件（首次或 lockfile 變更後）
pnpm dev             # Vite 開發伺服器（port 5173）
pnpm build           # tsc -b（type-check 專案參照）+ vite build -> dist/
pnpm preview         # 在本地預覽 production build
pnpm typecheck       # tsc -b --noEmit（只做型別檢查，不產出程式碼）
pnpm fetch-data      # 執行 scripts/fetch-data.ts（需要 GH_TOKEN 環境變數）
```

**沒有 lint 設定**，**沒有測試框架** —— 別自己發明 `pnpm lint` / `pnpm test`。`tsc -b` 的型別檢查是唯一的靜態檢查手段。

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

## 架構：兩階段資料管線

### Stage 1 —— build-time fetcher（`scripts/fetch-data.ts`）

跑在 CI（或本地執行 `GH_TOKEN=ghp_xxx pnpm run fetch-data`）。使用 `@octokit/rest` 搭配兩個 `p-limit` 池（`repoLimit=5`、`issueLimit=8`）以避開 GitHub 的 secondary rate limit。寫出：

- `public/data/summary.json` —— `Summary`（總計值 + 各 repo 的 `RepoSummary[]`，排序規則：有 milestone 的在前，然後依字母序）
- `public/data/repos.json` —— 單獨的 `RepoSummary[]`（方便用）
- `public/data/repos/{name}.json` —— 每個 repo 的 `RepoDetail`，**只在該 repo 至少有 1 個 milestone 時才產出**

會過濾掉 archived / fork 的 repo、PR 類型的 issue，以及任何帶有 `SENSITIVE_LABELS` 標籤的 issue（`confidential`、`security`、`internal-only`）。要新增敏感類別時**請擴充 `fetch-data.ts` 中的該集合** —— milestone 的計數仍會反映 GitHub 的原始數字，只有 issue 的標題／內文會被排除。

整個 `public/data/` 樹被 `.gitignore` 掉了 —— 它只在 fetch 之後存在，CI 每小時會重新產出。

### Stage 2 —— runtime loader（`src/data/loader.ts`）

- `loadSummary()` / `loadRepoDetail(name)` 是僅有的兩個進入點。
- 記憶體內的 `Map` 快取可避免同一個 session 內重複 fetch。
- URL 透過 `import.meta.env.BASE_URL` 組出，確保在 `/zenbu-milestones/` 這個 GitHub Pages base path 下一切正常。
- 所有 JSON 形狀都定義在 `src/data/types.ts` —— **那支檔案是 fetcher 與 SPA 之間共用的契約**。改動其中任何欄位，意味著 `scripts/fetch-data.ts` 與所有消費端元件都要一起更新。

### 路由

`src/App.tsx` 刻意使用 **`HashRouter`**（GitHub Pages 只能提供靜態檔案 —— 用 `BrowserRouter` 在深層連結會 404）。兩條路由：

- `/` → `OverviewPage`（所有 repo）
- `#/repo/:name` → `RoadmapPage`（單一 repo 的 milestone / issue）

`AppShell` 會載入一次 `summary.json`，處理 loading / error 狀態，並透過 `Outlet context`（`TAppShellContext`）把結果傳給子元件。

## 樣式規範

Tailwind 3 + 一套小型的 CSS custom-property 設計系統（在 `src/styles/globals.css`）：

- 顏色以 `--color-*` CSS 變數定義（`--color-brand`、`--color-surface`、`--color-text-*`，以及語意色 `--color-error|success|warning`）。`tailwind.config.js` 會把它們暴露成 Tailwind 的 utility 色（`bg-brand`、`text-text-primary` 等）。
- 可重用的 class 元件：`.btn-primary`、`.btn-secondary`、`.btn-ghost`、`.card`、`.label`、`.input`、`.badge`。建構新 UI 時**請優先使用這些**，不要堆一坨 ad-hoc class。
- 元件內的顏色值使用 `bg-[--color-surface]` 這種 arbitrary-value 語法直接引用 CSS 變數。

字型預設為 `'Noto Sans TC'`（繁體中文用）；UI 文案全部是 zh-Hant。

## 部署（`.github/workflows/build-and-deploy.yml`）

- 觸發條件：每小時 cron（`0 * * * *` UTC）、`push` 到 `master`、`workflow_dispatch`。
- 需要 repo secret **`ZENBU_ORG_READ_TOKEN`** —— 一個 fine-grained PAT，對 `zenbuapps` 組織的 contents / issues / metadata 有唯讀權限。沒設的話 job 會直接失敗並大聲報錯。
- `concurrency: pages` 搭配 `cancel-in-progress: false` —— 每小時的排程會排隊，不會踩到正在跑的部署。
- `actions/configure-pages@v5` 加上 `enablement: true`，首次執行時會自動啟用 Pages（見 commit `f0aac6f`）。
- 使用 Node 20 + pnpm 快取（`pnpm/action-setup@v4` + `actions/setup-node@v4` 的 `cache: pnpm`）。

## 雷區

- **程式碼中絕對不要 hard-code `/zenbu-milestones/`** —— 一律透過 `import.meta.env.BASE_URL`（範例見 `src/data/loader.ts`），這樣 `pnpm dev` 跟本地 `preview` 才會正常。
- `vite.config.ts` 的 `base` 必須與 GitHub Pages 的 repo 名稱保持同步。重新命名 repo → 改 `base` → 順便也要改 `index.html` 裡 `/favicon.svg` 的 href。
- `scripts/tsconfig.json` 是獨立的專案設定（target Node），跟 `tsconfig.app.json`（target 瀏覽器）不同。`pnpm build` 會透過 `tsc -b` 一次檢查兩邊。
- `IssueLite` 的 `labels` 保證 `name` 非空（fetcher 已過濾）；當 GitHub 回傳字串型 label 時，`color` 預設為 `'888888'`。
- `Milestone` 的 `completion` 是 `closedIssues / (openIssues + closedIssues)`，對空的 milestone 會回傳 `0` —— 不是 `null`。
