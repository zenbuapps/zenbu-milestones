# Data Pipeline Spec

> **狀態**：舊靜態資料管線（Stage 1 + Stage 2）於過渡期仍運作，供 `AppShell` / `RoadmapPage` 讀取 summary / repo detail。**新主線**為後端 API（`/api/summary` 與 `/api/repos/:name/detail` 實作完成後，此管線即可退役）。

## 總覽（過渡期）

```
┌──────────────────────┐     build-time     ┌───────────────────────┐     runtime      ┌──────────────────────┐
│  GitHub REST API     │  ───────────────▶  │  apps/web/public/     │  ─────────────▶  │  React SPA           │
│  (api.github.com)    │  @octokit/rest v21 │   data/*.json         │   fetch() + cache│  (OverviewPage +     │
│                      │  + p-limit         │  (static bundle)      │                  │   RoadmapPage)       │
└──────────────────────┘                    └───────────────────────┘                  └──────────────────────┘
      來源                                         中繼                                     消費端
```

Stage 1 目前只在本機執行（需 `GH_TOKEN` 環境變數）。Stage 2 在瀏覽器端跑。兩端之間不直接通訊，靠靜態 JSON 解耦。

---

## Stage 1 — Build-time Fetcher

**實作**：`apps/web/scripts/fetch-data.ts`
**執行命令**：`GH_TOKEN=ghp_xxx pnpm fetch-data`（根目錄）或 `pnpm --filter web fetch-data`

### 輸入

- 環境變數 `GH_TOKEN`：fine-grained PAT，對 `zenbuapps` org 的 Contents / Issues / Metadata 唯讀權限
- 硬編碼常數 `ORG = 'zenbuapps'`
- 硬編碼常數 `SENSITIVE_LABELS = { 'confidential', 'security', 'internal-only' }`

### 流程

1. **列出 org 所有 repo**：`octokit.repos.listForOrg({ org, type: 'all', per_page: 100 })`（含 private，paginate 到全部）
2. **過濾**：剔除 `archived` 與 `fork` 的 repo
3. **對每個 repo**（concurrency 上限 `repoLimit = 5`）：
   - 列出所有 milestone（`state: 'all'`）
   - 對每個 milestone（concurrency 上限 `issueLimit = 8`）：
     - 列出此 milestone 下所有 issue（`state: 'all'`，含 closed）
     - 過濾：剔除 `pull_request`（PR 會透過 issues endpoint 回傳）、剔除帶有 `SENSITIVE_LABELS` 的 issue
   - 組成 `Milestone` 物件（含 `completion = closed / (open + closed)`，空 milestone 回傳 `0`）
4. **產出**（寫入 `apps/web/public/data/`）：
   - `summary.json` — `Summary`（totals + repos，排序規則：有 milestone 的前；同類按字母序）
   - `repos.json` — 獨立的 `RepoSummary[]`
   - `repos/{name}.json` — `RepoDetail`，**僅當 `milestones.length > 0` 才產出**

### 為什麼兩個獨立的 p-limit 池

- 外層 `repoLimit = 5`：同時處理 5 個 repo 的任務
- 內層 `issueLimit = 8`：不分 repo，全局 8 個 issue 列表 concurrent fetch
- **理由**：單一 pool 時 5 repos × 20 milestones 每個會炸出 100 並行請求，直接命中 GitHub secondary rate limit

### 為什麼會把 sensitive issue 過濾掉，但 milestone 計數保留原值

`Milestone.openIssues` / `closedIssues` 來自 GitHub API 的 `open_issues` / `closed_issues` 欄位（GitHub 自己算的）。fetcher 不會因為過濾 sensitive label 而動這兩個數字。

結果：
- Milestone 顯示「5 / 10 issues 完成」仍是事實
- 但 `issues` 陣列裡看不到那些敏感 issue 的標題 / 內文 / labels

這是刻意的：進度百分比對外應與 GitHub UI 一致，只是敏感內容不外洩到靜態 bundle。

### 失敗行為

- 缺 `GH_TOKEN` → `process.exit(1)` + stderr 錯誤訊息
- 某個 repo 抓失敗 → log `✗ {repo} FAILED: {message}` 並 rethrow → 整個 fetcher 失敗
- 沒有 per-repo 的 retry 機制（依賴 `@octokit/plugin-throttling` 的自動 retry，但目前未啟用）

→ 任何 repo 炸，整個 fetch 流程 fail。這是故意的：避免產出不完整的 snapshot。

---

## Stage 2 — Runtime Loader

**實作**：`apps/web/src/data/loader.ts`
**執行環境**：瀏覽器

### Public API

```ts
loadSummary(): Promise<Summary>
loadRepoDetail(name: string): Promise<RepoDetail>
clearDataCache(): void            // 測試 / 手動用，正式流程不會呼叫
```

### URL resolve 規則

```ts
const base = import.meta.env.BASE_URL;           // dev: '/'；prod: 依 vite.config.ts::base 設定（目前為 '/'）
const normalizedBase = base.endsWith('/') ? base : `${base}/`;
const url = `${normalizedBase}data/${path}`;
```

**重要**：若未來部署到 sub-path（例如 `/dashboard/`），要同時設 `vite.config.ts::base` 與 `apps/web/index.html` 的 favicon href，不要在程式碼中 hard-code 路徑。

### 快取語意

- 模組內 `Map<string, unknown>` cache，**生命週期 = 整個 SPA session**
- 同一 path 第二次 `fetchJson` 直接從 cache 回傳
- 沒有 TTL，沒有 stale-while-revalidate
- 使用者重整頁面 → cache 清空、重新從 `public/data/*.json` 抓（通常 HTTP cache 會命中）

### 錯誤訊息格式

所有錯誤都包成 `Error(message)` 拋出，訊息以 `[loader]` 前綴：
- 網路錯誤：`[loader] 無法連線讀取 {url}：{cause}`
- HTTP 非 2xx：`[loader] 讀取 {url} 失敗（HTTP {status} {statusText}）`
- JSON parse 失敗：`[loader] 解析 {url} JSON 失敗：{cause}`

`AppShell` 會把這些 message 顯示在 `EmptyState` 的 description 裡給使用者看。

---

## 演化方向

本管線屬於過渡期遺留。新主線資料源為後端 API（`apps/api` NestJS + Prisma + PostgreSQL），目前已上線 auth / issue submission / admin / repo settings 等 endpoint。

待後端補上以下 endpoint 並前端切換消費者後，Stage 1 / Stage 2 即可整組退役：

| Endpoint | 取代 |
|---|---|
| `GET /api/summary` | `loadSummary()` |
| `GET /api/repos/:name/detail` | `loadRepoDetail(name)` |

遷移順序：
1. 後端實作並測試 endpoint（從 DB 讀取或 runtime 抓 GitHub + 快取）
2. 前端 `apps/web/src/data/api.ts` 加對應函式
3. `AppShell` / `RoadmapPage` 切換到新 API，保留短期 fallback
4. 移除 `apps/web/scripts/fetch-data.ts`、`apps/web/src/data/loader.ts`、`apps/web/public/data/`、相關依賴（`@octokit/rest` / `p-limit` / `pg` on 前端）

上述任一改造都是 architectural level 變更，必須更新本 spec、`data-contract.rule.md`、CLAUDE.md、SKILL.md。
