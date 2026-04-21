# Data Contract Rule

## 核心原則

`packages/shared/src/index.ts`（最底下「Dashboard data」與「Phase 2」兩個 section）是 **後端 `apps/api/src/dashboard/dashboard.service.ts`**（資料產出端）與 **前端 `apps/web/src/**/*.tsx`**（消費端）之間唯一的共享契約。動到任何一個欄位，都必須同步檢查三端：**shared 型別、api 產出、web 消費**。

本 rule 管轄：型別變更流程、API ↔ consumer 同步、契約演化約束。

---

## 強制規範

### 1. 修改 shared DTO 必須三端同步

任何對以下介面的變更：
- `Totals`、`Summary`
- `RepoSummary`、`NextDueMilestone`
- `RepoDetail`
- `Milestone`、`MilestoneState`、`MilestoneDerivedStatus`
- `IssueLite`、`IssueLabel`
- `MilestoneIssuesPage`、`GithubHealthStatus`、`RefreshDataResult`

必須在同一個 PR / commit 中：
1. **改 `packages/shared/src/index.ts`**（加 / 減 / 改欄位）
2. **跑 `pnpm build:shared`**（讓下游 workspace 拿得到新型別）
3. **改 `apps/api/src/dashboard/dashboard.service.ts`**（`buildRepoBundle` / `buildSummary` / `toIssueLite` 等產出端對齊）
4. **改所有 web 消費端**（Grep `from 'shared'` 找全）
5. **跑 `pnpm typecheck`** 確認三個 workspace（shared / api / web）全過

漏改任一端 → TS compiler 會報錯（DTO 是強型別 endpoint），但 runtime 若 TS 沒抓到（例如 service 漏填、client 讀 undefined），UI 會悄悄壞。所以 typecheck 跑完**還要手動打一次 endpoint 驗 shape**。

### 2. 欄位的合法值必須被明確記錄

新增欄位時，在 `shared/src/index.ts` 的欄位上用 inline comment 標注：
- 值域（`completionRate: number;  // 0–1`）
- 是否可為 null（`description: string | null;`）
- 格式（`updatedAt: string;  // ISO 8601`）
- 特殊語意（`nextDueMilestone: NextDueMilestone | null` —— 為 null 代表沒有未來的到期 milestone）

理由：當 UI 拿到 response 做運算時，邊界條件（0 / null / 空陣列）會直接決定顯示邏輯。

### 3. `Milestone.completion` 對空 milestone 回傳 0

```
completion = total === 0 ? 0 : closedIssues / (openIssues + closedIssues)
```

**不可改為 null**。下游元件（`MilestoneNode`、`ProgressBar`）預期收到 number，改成 nullable 會讓所有 `.toFixed()` / 乘算崩掉。
`computeCompletion` 邏輯在 `apps/api/src/dashboard/dashboard.service.ts` 與 `apps/web/src/utils/progress.ts` 兩端各有一份實作，兩者的邊界行為必須一致。

### 4. `IssueLite.labels` 的 `name` 保證非空

後端 `DashboardService.toIssueLite` 過濾了 `.filter((l) => !!l.name)`。消費端（`IssueList.tsx`）據此假設 `label.name` 永遠是非空字串，不做 null check。

如果要允許 empty label name：必須同時改 `IssueList.tsx` 的渲染邏輯與 `IssueLite` 的註解。

### 5. `IssueLite.labels[].color` 格式是 6 位 hex（無 `#`）

後端對字串型 label 用 `'888888'` 作為預設色。`IssueList.tsx` 的 `toHexColor` 會驗證 `^[0-9a-fA-F]{6}$`，不合法時 fallback 為 muted 樣式。

**不要在任何一端前面加 `#` 或改成 CSS 色名**，否則 tooling 會 silently 降級。

### 6. `Summary.repos` 的排序是契約的一部分

`DashboardService.buildSummary` 在回傳前排序：
- 有 milestone 的 repo 優先（`milestoneCount > 0`）
- 同類內依 `name.localeCompare()` 字母序

`Sidebar` 與 `OverviewPage` 會依賴這個排序（雖然 `Sidebar` 有再排一次作為保險）。如果要改排序規則，必須同時更新此 rule 與後端 service / sidebar。

---

## 敏感欄位過濾

`SENSITIVE_LABELS`（目前為 `confidential` / `security` / `internal-only`）定義在 `apps/api/src/dashboard/dashboard.service.ts`。

- 要新增敏感類別：**只需擴充該集合**，不需改 shared 型別（issue 直接從陣列中剔除，client 看不到）
- **注意**：milestone 的 `openIssues` / `closedIssues` 是 GitHub 回傳的原始計數，**不會**因為 label 過濾而減少。這是故意的 —— 進度百分比仍以 GitHub 的事實為準，只是敏感 issue 的「標題／內文／labels」不會外洩到 API response
- Cache key 已依 `(owner, name)` 分，清掉要走 `POST /api/admin/refresh-data`

如果未來需要「連 milestone 進度也反映過濾後的數字」：這是一次契約變更，需要同時改 service 的計算邏輯與 `Milestone.openIssues` / `closedIssues` 的語意註解。

---

## 新增欄位的流程（速查）

1. 在 `packages/shared/src/index.ts` 加欄位（含 inline comment 說明值域 / 可空性）
2. `pnpm build:shared`（讓 api / web workspace 拿得到新型別）
3. 在 `apps/api/src/dashboard/dashboard.service.ts` 對應產出處填值
4. 在 web 消費端使用，走 TS compiler 逼自己處理 null / undefined
5. `pnpm typecheck` → `pnpm build`
6. 本地 `pnpm dev:api` 起後端，`curl http://localhost:3000/api/summary` 或開瀏覽器 DevTools Network 驗 JSON shape
7. `pnpm dev:web` 快速看 UI

## 刪除欄位的流程（速查）

1. 先在 web 消費端移除所有使用點（Grep / find_referencing_symbols）
2. 再從 `DashboardService` 產出移除
3. 最後從 `shared/src/index.ts` 刪除型別
4. `pnpm build:shared` + `pnpm typecheck` 會協助找漏改處

順序顛倒會導致 TS 報一堆 error，但修完仍安全。

---

## Cache 注意事項

後端 dashboard endpoints 套 5 分鐘 in-memory TTL cache（`DashboardCacheService`）。改了 service 邏輯但測試拿到舊資料時：
- 重啟 api server（最乾脆）
- 或 admin 打 `POST /api/admin/refresh-data` 清所有 `dashboard:` prefix 的 key
- 10 秒內重複 refresh 會被後端 429 擋
