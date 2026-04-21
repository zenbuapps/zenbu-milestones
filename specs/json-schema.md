# JSON Schema Spec

## 單一事實來源

Dashboard endpoints 回傳 JSON 的形狀由 `packages/shared/src/index.ts` 的 **「Dashboard data」** 與 **「Phase 2」** 兩個 section 定義。本文件是對這些型別的**註解與邊界說明**，不複製型別本身。任何衝突以 `shared/src/index.ts` 為準。

---

## Endpoints 與回傳形狀

| Path | Response type | 何時 204 / 404 |
|---|---|---|
| `GET /api/summary` | `Summary` | 永遠 200（不會空） |
| `GET /api/repos/:owner/:name/detail` | `RepoDetail` | repo 不存在時 404 |
| `GET /api/repos/:owner/:name/milestones/:number/issues` | `MilestoneIssuesPage` | milestone 不存在時 404 |
| `GET /api/health/github` | `GithubHealthStatus` | 永遠 200（ok=false 也回 200） |
| `POST /api/admin/refresh-data` | `RefreshDataResult` | 429（10s debounce 內重複打） |

消費端判斷「某 repo 有 detail 可以載」的正確方法：
```ts
if (repoSummary.milestoneCount > 0) {
  const detail = await fetchRepoDetail(owner, repoSummary.name);
}
```

`milestoneCount === 0` 時後端可能回空 `RepoDetail`（`milestones: []`）；前端可早退避免多餘請求。

---

## Summary

頂層包含 `generatedAt`（ISO 8601 產出時間）、`totals`（全域統計）、`repos`（所有 repo 的精簡資訊）。

### `Totals`

| 欄位 | 語意 | 邊界 |
|---|---|---|
| `repos` | **有** milestone 的 repo 數 | `repos ≤ allRepos` |
| `allRepos` | 所有 repo 數（含無 milestone 的）| 剔除 archived / fork 後的數字 |
| `milestones` | 全 org 總 milestone 數（含 closed）| — |
| `openMilestones` | 全 org open milestone 總數 | — |
| `closedMilestones` | 全 org closed milestone 總數 | `open + closed = milestones` |
| `overdueMilestones` | 全 org 逾期 milestone 數（open + `dueOn < now`）| `overdue ≤ openMilestones` |
| `openIssues` / `closedIssues` | 全 org issues 計數（來自 milestone 的加總；**未包含不在任何 milestone 內的 issue**）| — |

**已知精度限制**：`Totals.openMilestones` 包含 `overdue` + `in_progress` + `no_due`（無 `dueOn` 的 open milestone）。Summary 層無法精確分辨後兩者 —— 見 `apps/web/src/pages/OverviewPage.tsx::donutData` 的備註。RoadmapPage 使用 detail 可精確分類。

### `Summary.repos` 的排序（契約）

```
hasMilestones desc, name asc
```

亦即：有 milestone 的 repo 在前（字母序），無 milestone 的 repo 在後（字母序）。`Sidebar` 與 `OverviewPage` 的 `activeRepos` filter 依賴此排序（雖然 `Sidebar` 有再排一次作為保險）。

---

## RepoSummary

每個 repo 的精簡快照（列表頁用）。

### 必填欄位

| 欄位 | 型別 | 說明 |
|---|---|---|
| `name` | string | repo short name（不含 org prefix）|
| `htmlUrl` | string | GitHub UI URL |
| `isPrivate` | boolean | 是否為 private repo（UI 顯示鎖頭圖示）|
| `milestoneCount` | number | 總 milestone 數（含 closed）|
| `completionRate` | number | **[0, 1]**，`closedIssues / (openIssues + closedIssues)`；全空時為 `0` |

### 可空欄位

| 欄位 | `null` 含意 |
|---|---|
| `description` | repo 沒填描述 |
| `language` | repo 沒有主要語言（常見於純 markdown repo）|
| `nextDueMilestone` | **沒有**未來 / 已到期的 open milestone 帶 `dueOn`（**注意**：有 open milestone 但都沒 `dueOn` 時也會是 null）|

---

## RepoDetail

單一 repo 的完整 milestone + issue 列表（詳情頁用）。

與 `RepoSummary` 的差異：
- 不帶聚合指標（`completionRate` / `overdueCount` / `nextDueMilestone` 等）
- 多了 `milestones: Milestone[]`，每個 `Milestone` 帶完整 `issues: IssueLite[]`
- 多了 `allIssues: IssueLite[]`（不限 milestone 範圍；與 `milestones[].issues` 可能重疊）

---

## Milestone

### 狀態機

| `state` | 語意 |
|---|---|
| `"open"` | 進行中（可能逾期）|
| `"closed"` | 已關閉（可能是 done，也可能是 cancelled —— GitHub 不區分）|

UI 層在 `apps/web/src/utils/progress.ts::deriveMilestoneStatus` 把 `state` + `dueOn` 推導為 4 類：

```
state = 'closed'                → 'done'
state = 'open' && no dueOn      → 'no_due'
state = 'open' && dueOn < now   → 'overdue'
state = 'open' && dueOn ≥ now   → 'in_progress'
```

**這個衍生類別是 UI 專屬**，不從 API 回傳（可在瀏覽器端按當下時間重算）。

### `completion` 的邊界

```
completion = (openIssues + closedIssues === 0) ? 0 : closedIssues / (openIssues + closedIssues)
```

- 值域 **[0, 1]**，永遠不是 `null` 或 `undefined`
- 空 milestone（剛建立、還沒 issue）= `0`（**不是 null**；`ProgressBar` 直接乘算）
- 後端 `DashboardService.computeCompletion` 與前端 `apps/web/src/utils/progress.ts::computeCompletion` 各有一份實作，邊界行為必須一致

### 時間欄位

| 欄位 | 格式 | 可空 |
|---|---|---|
| `dueOn` | ISO 8601（`2025-06-30T23:59:59Z`）| ✅ |
| `createdAt` | ISO 8601 | ❌ |
| `updatedAt` | ISO 8601 | ❌ |
| `closedAt` | ISO 8601 | ✅（僅 `state: 'closed'` 時必非空）|

---

## IssueLite

後端對每個 issue 做的 lite 投影（只保 UI 用得到的欄位，不帶 body / reactions 等）。

### 保證

- `labels` 中的每個 label `.name` **非空字串**（`DashboardService.toIssueLite` 已 `.filter((l) => !!l.name)`）
- `labels[].color` **6 位 hex，無 `#`**（GitHub 回傳字串型 label 時 fallback 為 `'888888'`）
- **不包含 PR**：後端 service 用 `.filter((i) => !i.pull_request)` 排除
- **不包含 sensitive**：後端用 `SENSITIVE_LABELS` 排除

### `assignees` 的形狀

`string[]` —— GitHub 的 login name。需要頭像時自行拼 `https://github.com/{login}.png?size=24`（見 `apps/web/src/components/IssueList.tsx`）。

---

## `nextDueMilestone` 的選取邏輯

在 `apps/api/src/dashboard/dashboard.service.ts::buildRepoBundle`（或同功能 method）：

```ts
const nextDue = openMs
  .filter((m) => m.dueOn)
  .sort((a, b) => new Date(a.dueOn!).getTime() - new Date(b.dueOn!).getTime())[0];
```

定義：
- **僅看 open milestone**
- **僅看有 `dueOn` 的**
- **按 dueOn 升序**取第一個（即最接近的 —— 可能已逾期也可能未到）

結果可能是「逾期最久的」，這是設計：UI 需要知道「下一個應該關注的 milestone」，逾期的優先級最高。

---

## MilestoneIssuesPage（分頁端點）

`GET /api/repos/:owner/:name/milestones/:number/issues?page=&perPage=` 的回傳：

```
{ items: IssueLite[], page, perPage, total, hasMore }
```

- `page` 1-indexed；預設 1
- `perPage` 預設 20（後端限制上限看 DTO）
- `total` 該 milestone 的**過濾後** issue 總數（扣除 PR 與 SENSITIVE_LABELS）
- `hasMore` = `page * perPage < total`

此端點為**大型 milestone** 設計；小 milestone 直接讀 `RepoDetail.milestones[].issues` 即可。

---

## 演化契約時的檢查清單

（詳見 `.claude/rules/data-contract.rule.md`）

1. 改 `shared/src/index.ts` → `pnpm build:shared` → 同步改 `DashboardService` 產出端
2. 同步改 web 所有消費端（Grep `Summary`、`RepoSummary`、`Milestone`、`IssueLite`）
3. 本文件（`json-schema.md`）要同步更新「邊界」「排序」「保證」段落
4. `pnpm typecheck` 跨三個 workspace 全過
5. 本地 `pnpm dev:api` 起後端，`curl` 驗 JSON 長相
