# Data Contract Rule

## 核心原則

`src/data/types.ts` 是 **build-time fetcher**（`scripts/fetch-data.ts`）與 **SPA runtime**（`src/**/*.tsx`）兩端之間唯一的共享契約。動到它的任何一個欄位，都必須同步檢查三端：**序列化端、讀取端、所有消費端**。

本 rule 管轄：型別變更流程、fetcher ↔ consumer 同步、契約演化約束。

---

## 強制規範

### 1. 修改 types.ts 必須三端同步

任何對以下介面的變更：
- `Totals`、`Summary`
- `RepoSummary`、`RepoDetail`
- `Milestone`、`MilestoneState`、`MilestoneDerivedStatus`
- `IssueLite`

必須在同一個 PR / commit 中：
1. **更新 `scripts/fetch-data.ts`**（`buildRepoDetail` / `main` 產出端的形狀對齊）
2. **更新 `src/data/loader.ts`**（若有新的入口需要）
3. **更新所有消費端元件**（透過 Grep / find_referencing_symbols 找全）
4. **執行 `pnpm typecheck`** 確認三個 project reference 全過

漏改任一端 → CI 或 runtime 會壞掉，因為 JSON 與 TS 型別可能悄悄失配（runtime 抓的 JSON 少了新欄位，UI 會 `undefined`）。

### 2. JSON 形狀欄位的合法值必須被明確記錄

新增欄位時，在 `types.ts` 的欄位上用 inline comment 標注：
- 值域（`completionRate: number;  // 0–1`）
- 是否可為 null（`description: string | null;`）
- 格式（`updatedAt: string;  // ISO 8601`）
- 特殊語意（`nextDueMilestone: {...} | null` —— 為 null 代表沒有未來的到期 milestone）

理由：當 UI 拿到這個 JSON 做運算時，邊界條件（0 / null / 空陣列）會直接決定顯示邏輯。

### 3. `Milestone.completion` 對空 milestone 回傳 0

```
completion = total === 0 ? 0 : closedIssues / (openIssues + closedIssues)
```

**不可改為 null**。下游元件（`MilestoneNode`、`ProgressBar`）預期收到 number，改成 nullable 會讓所有 `.toFixed()` / 乘算崩掉。
`computeCompletion` 在 `scripts/fetch-data.ts` 與 `src/utils/progress.ts` 兩端各有一份實作，兩者的邊界行為必須一致。

### 4. `IssueLite.labels` 的 `name` 保證非空

Fetcher 在 `listMilestoneIssues` 過濾了 `.filter((l) => !!l.name)`。消費端（`IssueList.tsx`）據此假設 `label.name` 永遠是非空字串，不做 null check。

如果要允許 empty label name：必須同時改 `IssueList.tsx` 的渲染邏輯與 `types.ts` 的註解。

### 5. `IssueLite.labels[].color` 格式是 6 位 hex（無 `#`）

`fetch-data.ts` 對字串型 label 用 `'888888'` 作為預設色。`IssueList.tsx` 的 `toHexColor` 會驗證 `^[0-9a-fA-F]{6}$`，不合法時 fallback 為 muted 樣式。

**不要在任何一端前面加 `#` 或改成 CSS 色名**，否則 tooling 會 silently 降級。

### 6. `Summary.repos` 的排序是契約的一部分

`scripts/fetch-data.ts` 在寫檔前排序：
- 有 milestone 的 repo 優先（`milestoneCount > 0`）
- 同類內依 `name.localeCompare()` 字母序

`Sidebar` 與 `OverviewPage` 會依賴這個排序（雖然 `Sidebar` 有再排一次作為保險）。如果要改排序規則，必須同時更新此 rule 與 fetcher / sidebar。

---

## 與 fetcher 相關的敏感欄位過濾

`SENSITIVE_LABELS`（目前為 `confidential` / `security` / `internal-only`）定義在 `scripts/fetch-data.ts`。

- 要新增敏感類別：**只需擴充該集合**，不需改 types（issue 直接從陣列中剔除，SPA 端看不到）
- **注意**：milestone 的 `openIssues` / `closedIssues` 是 GitHub 回傳的原始計數，**不會**因為 label 過濾而減少。這是故意的 —— 進度百分比仍以 GitHub 的事實為準，只是敏感 issue 的「標題／內文／labels」不會外洩到 `public/data/`。

如果未來需要「連 milestone 進度也反映過濾後的數字」：這是一次契約變更，需要同時改 fetcher 的計算邏輯與 `Milestone.openIssues` / `closedIssues` 的語意註解。

---

## 新增欄位的流程（速查）

1. 在 `src/data/types.ts` 加欄位（含 inline comment 說明值域 / 可空性）
2. 在 `scripts/fetch-data.ts` 的對應產出處填值（若來自 GitHub API）或計算（若是衍生值）
3. 在 `src/data/loader.ts` —— 通常不用改（除非新增一個全新的 JSON endpoint）
4. 在消費端元件使用，走 TS compiler 逼自己處理 null / undefined
5. `pnpm typecheck` → `pnpm build`
6. 本地 `GH_TOKEN=... pnpm fetch-data` 一次，用 `cat public/data/summary.json | head -50` 肉眼驗 JSON 形狀
7. `pnpm preview` 快速看 UI

## 刪除欄位的流程（速查）

1. 先在消費端移除所有使用點（Grep / find_referencing_symbols）
2. 再從 fetcher 產出移除
3. 最後從 `types.ts` 刪除型別
4. `pnpm typecheck` 會協助找漏改處

順序顛倒會導致 TS 報一堆 error，但修完仍安全。
