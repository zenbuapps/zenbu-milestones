# JSON Schema Spec

## 單一事實來源

`public/data/*.json` 的所有形狀由 `src/data/types.ts` 定義。本文件是對 `types.ts` 的**註解與邊界說明**，不複製型別本身。任何衝突以 `types.ts` 為準。

---

## 產出檔清單

| 路徑 | 型別 | 是否一定存在 |
|---|---|---|
| `public/data/summary.json` | `Summary` | 是（每次 fetch 必產出）|
| `public/data/repos.json` | `RepoSummary[]` | 是 |
| `public/data/repos/{name}.json` | `RepoDetail` | **僅當該 repo 至少有 1 個 milestone** |

檢查「某 repo 有 detail 可以載」的正確方法：
```ts
if (repoSummary.milestoneCount > 0) {
  const detail = await loadRepoDetail(repoSummary.name);
}
```

直接硬 `loadRepoDetail(name)` 可能 404。

---

## Summary（`summary.json`）

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

**已知精度限制**：`Totals.openMilestones` 包含 `overdue` + `in_progress` + `no_due`（無 `dueOn` 的 open milestone）。Summary 層無法精確分辨後兩者 —— 見 `OverviewPage.tsx::donutData` 的備註。RoadmapPage 使用 detail 可精確分類。

### `Summary.repos` 的排序（契約）

```
hasMilestones desc, name asc
```

亦即：有 milestone 的 repo 在前（字母序），無 milestone 的 repo 在後（字母序）。Sidebar 與 OverviewPage 的 `activeRepos` filter 依賴此排序。

---

## RepoSummary

每個 repo 的精簡快照（列表頁用）。

### 必填欄位

| 欄位 | 型別 | 說明 |
|---|---|---|
| `name` | string | repo short name（不含 org prefix）|
| `htmlUrl` | string | GitHub UI URL |
| `isPrivate` | boolean | 是否為 private repo（UI 會顯示鎖頭圖示）|
| `milestoneCount` | number | 總 milestone 數（含 closed）|
| `completionRate` | number | **[0, 1]**，`closedIssues / (openIssues + closedIssues)`；全空時為 `0` |

### 可空欄位

| 欄位 | `null` 含意 |
|---|---|
| `description` | repo 沒填描述 |
| `language` | repo 沒有主要語言（常見於純 markdown repo）|
| `nextDueMilestone` | **沒有**未來 / 已到期的 open milestone 帶 `dueOn`（**注意**：有 open milestone 但都沒 `dueOn` 時也會是 null）|

---

## RepoDetail（`repos/{name}.json`）

單一 repo 的完整 milestone + issue 列表（詳情頁用）。

與 `RepoSummary` 的差異：
- 不帶聚合指標（`completionRate` / `overdueCount` / `nextDueMilestone` 等）
- 多了 `milestones: Milestone[]`，每個 `Milestone` 帶完整 `issues: IssueLite[]`

### 何時會不存在？

`milestones.length === 0` 時 fetcher 不寫檔。消費端必須靠 `RepoSummary.milestoneCount > 0` 預判，或處理 404 錯誤。

---

## Milestone

### 狀態機

| `state` | 語意 |
|---|---|
| `"open"` | 進行中（可能逾期）|
| `"closed"` | 已關閉（可能是 done，也可能是 cancelled —— GitHub 不區分）|

UI 層在 `src/utils/progress.ts::deriveMilestoneStatus` 把 `state` + `dueOn` 推導為 4 類：

```
state = 'closed'                → 'done'
state = 'open' && no dueOn      → 'no_due'
state = 'open' && dueOn < now   → 'overdue'
state = 'open' && dueOn ≥ now   → 'in_progress'
```

**這個衍生類別是 UI 專屬**，不寫進 JSON（節省 bundle 大小，且可在瀏覽器端按當下時間重算）。

### `completion` 的邊界

```
completion = (openIssues + closedIssues === 0) ? 0 : closedIssues / (openIssues + closedIssues)
```

- 值域 **[0, 1]**，永遠不是 `null` 或 `undefined`
- 空 milestone（剛建立、還沒 issue）= `0`（**不是 null**；`ProgressBar` 直接乘算）

### 時間欄位

| 欄位 | 格式 | 可空 |
|---|---|---|
| `dueOn` | ISO 8601（`2025-06-30T23:59:59Z`）| ✅ |
| `createdAt` | ISO 8601 | ❌ |
| `updatedAt` | ISO 8601 | ❌ |
| `closedAt` | ISO 8601 | ✅（僅 `state: 'closed'` 時必非空）|

---

## IssueLite

Fetcher 對每個 issue 做的 lite 投影（只保 UI 用得到的欄位，不帶 body / reactions 等）。

### 保證

- `labels` 中的每個 label `.name` **非空字串**（fetcher 已 `.filter((l) => !!l.name)`）
- `labels[].color` **6 位 hex，無 `#`**（GitHub 回傳字串型 label 時 fallback 為 `'888888'`）
- **不包含 PR**：fetcher 在 `listMilestoneIssues` 用 `.filter((i) => !i.pull_request)` 排除
- **不包含 sensitive**：fetcher 用 `SENSITIVE_LABELS` 排除

### `assignees` 的形狀

`string[]` —— GitHub 的 login name。需要頭像時自行拼 `https://github.com/{login}.png?size=24`（見 `IssueList.tsx`）。

---

## `nextDueMilestone` 的選取邏輯

在 `scripts/fetch-data.ts::buildRepoDetail`：

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

## 演化契約時的檢查清單

（詳見 `.claude/rules/data-contract.rule.md`）

1. 改 `types.ts` → 同步改 `fetch-data.ts` 的產出端
2. 改 `types.ts` → 檢查所有消費端（Grep `Summary`、`RepoSummary`、`Milestone`、`IssueLite`）
3. 本文件（`json-schema.md`）要同步更新「邊界」「排序」「保證」段落
4. `pnpm typecheck` 跨三個 project reference 全過
5. 本地跑一次 fetcher，用 `cat public/data/summary.json | head -30` 驗 JSON 長相
