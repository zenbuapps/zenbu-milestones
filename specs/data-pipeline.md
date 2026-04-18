# Data Pipeline Spec

## 總覽

本專案用 **兩階段管線** 把 GitHub 的 live 資料轉為靜態儀表板內容：

```
┌──────────────────────┐     build-time     ┌──────────────────────┐     runtime      ┌──────────────────────┐
│  GitHub REST API     │  ───────────────▶  │  public/data/*.json  │  ─────────────▶  │  React SPA           │
│  (api.github.com)    │  @octokit/rest v21 │  (static bundle)     │   fetch() + cache│  (OverviewPage +     │
│                      │  + p-limit         │                      │                  │   RoadmapPage)       │
└──────────────────────┘                    └──────────────────────┘                  └──────────────────────┘
      來源                                         中繼                                     消費端
```

Stage 1 在 CI 跑（每小時 cron 觸發），Stage 2 在瀏覽器端跑。兩端之間不直接通訊，靠靜態 JSON 解耦。

---

## Stage 1 — Build-time Fetcher

**實作**：`scripts/fetch-data.ts`
**執行命令**：`GH_TOKEN=ghp_xxx pnpm run fetch-data`（本地）；CI 用 `ZENBU_ORG_READ_TOKEN` secret 映射為 `GH_TOKEN`

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
4. **產出**：
   - `public/data/summary.json` — `Summary`（totals + repos，排序規則：有 milestone 的前；同類按字母序）
   - `public/data/repos.json` — 獨立的 `RepoSummary[]`
   - `public/data/repos/{name}.json` — `RepoDetail`，**僅當 `milestones.length > 0` 才產出**

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

→ 任何 repo 炸，整個 CI fail。這是故意的：避免部署出不完整的 snapshot。

---

## Stage 2 — Runtime Loader

**實作**：`src/data/loader.ts`
**執行環境**：瀏覽器（Vite 編譯後在 `/zenbu-milestones/` base path 下執行）

### Public API

```ts
loadSummary(): Promise<Summary>
loadRepoDetail(name: string): Promise<RepoDetail>
clearDataCache(): void            // 測試 / 手動用，正式流程不會呼叫
```

### URL resolve 規則

```ts
const base = import.meta.env.BASE_URL;           // dev: '/'；prod: '/zenbu-milestones/'
const normalizedBase = base.endsWith('/') ? base : `${base}/`;
const url = `${normalizedBase}data/${path}`;
```

**重要**：絕不 hard-code `/zenbu-milestones/`，否則 dev server 下無法載資料。

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

## 端對端時序

```
      │
      │ 13:00:00 UTC (cron trigger)
      ▼
  GitHub Actions workflow 'build-and-deploy.yml'
      │
      ├─ checkout
      ├─ setup pnpm + node 20
      ├─ pnpm install --frozen-lockfile
      ├─ pnpm run fetch-data                         ← Stage 1，耗時通常 10–30 秒
      │     │
      │     ├─ listForOrg('zenbuapps')               ← 1 request
      │     ├─ × 每個 repo：listMilestones()          ← N requests（平行 ≤ 5）
      │     └─ × 每個 milestone：listForRepo(issues) ← M requests（平行 ≤ 8）
      │
      ├─ actions/configure-pages@v5                  ← enablement: true
      ├─ pnpm run build                              ← tsc -b + vite build → dist/
      ├─ actions/upload-pages-artifact@v3 (dist/)
      │
      └─ deploy job
            └─ actions/deploy-pages@v4               ← 原子切換

  https://zenbuapps.github.io/zenbu-milestones/ 更新

      │
      │ 使用者打開網址
      ▼
  瀏覽器載 index.html + JS bundle
      │
      └─ React mount
            └─ AppShell useEffect
                  └─ loadSummary()                   ← Stage 2
                        └─ fetch('/zenbu-milestones/data/summary.json')
                              └─ 200 OK + JSON

  使用者看見 OverviewPage

      │
      │ 使用者點 RepoCard 的「查看 Roadmap」
      ▼
  react-router 導航到 #/repo/{name}
      └─ RoadmapPage useEffect
            └─ loadRepoDetail(name)
                  └─ fetch('/zenbu-milestones/data/repos/{name}.json')
                        └─ 200 OK + JSON

  使用者看見 Milestone 時間軸
```

---

## 演化時的限制與機會

### 現況的限制

- **每小時才更新**：剛建立的 issue 要等最多 1 小時才會出現在 dashboard
- **全量重建**：每小時重跑整個 fetcher，不做增量
- **PAT 依賴**：需要一個 90-day-expires 的 fine-grained PAT；過期前要換

### 若要移除這些限制

| 目標 | 可能方案 | 影響面 |
|---|---|---|
| 即時更新 | Webhook → Cloudflare Worker → static bundle CDN | 失去「純 GitHub Pages」定位 |
| 增量抓取 | 存上次 `updated_at`，只抓 `since=` | 要引入 state store（Actions cache / Gist）|
| 免 PAT | GitHub App installation token | 要註冊 App + UI 同意流程 |

上述任一改造都是 architectural level 變更，必須更新本 spec、`data-contract.rule.md`、CLAUDE.md。
