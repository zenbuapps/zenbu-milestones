---
version: 0.1.0
date: 2026-04-18
status: draft
depends_on:
  - specs/data-pipeline.md
  - specs/json-schema.md
  - .claude/rules/data-contract.rule.md
---

# Data Contract — Visitor Issue Submission

本檔案定義 V1 需要變更的所有資料契約。遵循 `.claude/rules/data-contract.rule.md` 的強制規範：**`types.ts` 任一欄位變更，三端（fetcher、loader、消費者）同步更新**，並 `pnpm typecheck` 通過。

---

## 影響範圍速覽

| 契約層 | 變更類型 | 詳細 |
|--------|---------|------|
| `src/data/types.ts` | **modify** | `IssueLite` +type、`RepoSummary` +canSubmitIssue |
| `scripts/fetch-data.ts` | **modify** | 產出新欄位、新 JSON 檔 |
| `src/data/loader.ts` | **create（小）** | 新增 `loadIssueTypes()` 入口 |
| `public/data/issue-types.json` | **create** | 新靜態 JSON 檔 |
| Worker API envelope（新）| **create** | 非 `types.ts` 範圍，獨立 schema 文件 |

---

## 1. `src/data/types.ts` 變更

### 1.1 `IssueLite` 新增 `type` 欄位

```ts
// src/data/types.ts（修改後）
export interface IssueLite {
  number: number;
  title: string;
  state: 'open' | 'closed';
  htmlUrl: string;
  labels: IssueLabel[];
  assignees: string[];  // login names
  updatedAt: string;    // ISO 8601
  closedAt: string | null;

  /**
   * GitHub Issue Type 名稱（2024/09 GA）。
   * V1 值域範例：'Bug' / 'Feature' / 'Task'（由 zenbuapps org 定義）。
   * null 代表此 issue 尚未設定 type（舊 issue 或 org 未啟用 Issue Types）。
   */
  type: string | null;
}
```

**欄位語意**：
- **值域**：字串，值由 `public/data/issue-types.json` 列出（執行期檢查）
- **可空性**：`null` 表示未設定（舊 issue 或 org 未啟用）
- **大小寫**：照 GitHub 回傳，通常首字大寫（`"Bug"`，非 `"bug"`）

### 1.2 `RepoSummary` 新增 `canSubmitIssue` 欄位

```ts
export interface RepoSummary {
  name: string;
  htmlUrl: string;
  isPrivate: boolean;
  description: string | null;
  language: string | null;
  milestoneCount: number;
  closedMilestoneCount: number;
  openIssues: number;
  closedIssues: number;
  overdueCount: number;
  completionRate: number;  // [0, 1]
  nextDueMilestone: NextDueMilestone | null;

  /**
   * 該 repo 是否接受訪客透過 Zenbu Milestones 儀表板提交 issue / 留言。
   * V1 規則：!isPrivate && milestoneCount > 0
   * false：OverviewPage 顯示在「僅供瀏覽」折疊區塊；RoadmapPage 隱藏「建立 issue」按鈕；
   *        Worker 拒絕對此 repo 的寫入請求。
   */
  canSubmitIssue: boolean;
}
```

**欄位語意**：
- **型別**：`boolean`（**不是 nullable**），fetcher 保證每個 repo 都有此欄位
- **計算方式**：`!repo.isPrivate && milestones.length > 0`
- **前端 fallback**：若 summary.json 意外缺此欄位（例如部署時序問題），前端以嚴格比對 `=== true` 作為 guard，缺失時視為 false（NFR-013）

---

## 2. `scripts/fetch-data.ts` 變更

### 2.1 讀取 issue.type

`octokit.issues.listForRepo` 的 response 需取 `issue.type?.name`。@octokit/rest v21.1.1 auto-generated type 應已包含此欄位，實作時需驗證；若型別不完整，使用 `as unknown as { type?: { name: string } }` 補齊。

```ts
// scripts/fetch-data.ts（節錄）
function toIssueLite(issue: GitHubIssueResponse): IssueLite {
  return {
    number: issue.number,
    title: issue.title,
    state: issue.state as 'open' | 'closed',
    htmlUrl: issue.html_url,
    labels: extractLabels(issue.labels),
    assignees: (issue.assignees ?? []).map(a => a.login).filter(Boolean),
    updatedAt: issue.updated_at,
    closedAt: issue.closed_at,
    type: issue.type?.name ?? null,   // ★ 新
  };
}
```

### 2.2 計算 canSubmitIssue

```ts
// scripts/fetch-data.ts（節錄）
function toRepoSummary(repo: GitHubRepo, milestones: Milestone[], ...): RepoSummary {
  const milestoneCount = milestones.length;
  return {
    name: repo.name,
    htmlUrl: repo.html_url,
    isPrivate: repo.private,
    // ...其他欄位照舊...
    canSubmitIssue: !repo.private && milestoneCount > 0,   // ★ 新
  };
}
```

### 2.3 新增 issue-types.json 產出

```ts
// scripts/fetch-data.ts main() 尾段（節錄）
async function fetchIssueTypes(octokit: Octokit, org: string): Promise<IssueType[]> {
  try {
    // GET /orgs/{org}/issue-types
    const resp = await octokit.request('GET /orgs/{org}/issue-types', { org });
    return resp.data.map(t => ({
      name: t.name,
      description: t.description ?? null,
    }));
  } catch (err) {
    if (err.status === 404 || err.status === 403) {
      // Org 未啟用 Issue Types 或 PAT 無 admin:org scope
      console.warn('Issue Types not available:', err.message);
      return [];
    }
    throw err;
  }
}

// main()：
const issueTypes = await fetchIssueTypes(octokit, ORG);
await fs.writeFile('public/data/issue-types.json', JSON.stringify(issueTypes, null, 2));
```

**PAT scope 需求**：
- `GET /orgs/{org}/issue-types` 需要 **`admin:org` read** scope
- 既有 `ZENBU_ORG_READ_TOKEN` 必須加此 scope（見 `deployment.md`）
- 若拒絕加此 scope，改由 Worker 以 `ZENBU_ORG_WRITE_TOKEN` 代查（OQ-003）

### 2.4 排序與寫檔不變

`Summary.repos` 排序（`hasMilestones desc, name asc`）、`public/data/repos/{name}.json` 僅在 `milestoneCount > 0` 產出等規則**維持不變**。

---

## 3. `src/data/loader.ts` 變更

### 3.1 新增 `loadIssueTypes()` 入口

```ts
// src/data/loader.ts（新增）
import type { IssueType } from './types';

const resolveDataUrl = (path: string): string => {
  const base = import.meta.env.BASE_URL;
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}data/${path}`;
};

const issueTypesCache: { value: IssueType[] | null } = { value: null };

export async function loadIssueTypes(): Promise<IssueType[]> {
  if (issueTypesCache.value !== null) return issueTypesCache.value;
  const url = resolveDataUrl('issue-types.json');
  const res = await fetch(url);
  if (!res.ok) {
    // Tolerate missing file (older deploy without this data)
    if (res.status === 404) {
      issueTypesCache.value = [];
      return [];
    }
    throw new Error(`[loader] 讀取 ${url} 失敗（HTTP ${res.status} ${res.statusText}）`);
  }
  const data = await res.json();
  issueTypesCache.value = data;
  return data;
}
```

**容錯**：`issue-types.json` 不存在時（404）回傳空陣列，前端據此隱藏 type 欄位。

---

## 4. `public/data/issue-types.json`（新增）

### 4.1 Schema

```ts
// src/data/types.ts（新增）
export interface IssueType {
  /**
   * Issue Type 的顯示名稱（由 org owner 在 GitHub org settings 設定）。
   * 範例：'Bug' / 'Feature' / 'Task'
   * 此字串即 `IssueLite.type` 的可能值。
   */
  name: string;

  /**
   * 由 org owner 設定的說明文字，可為 null。
   * 前端在下拉選單的 tooltip 顯示。
   */
  description: string | null;
}
```

### 4.2 檔案範例

```json
[
  { "name": "Bug", "description": "Something is broken" },
  { "name": "Feature", "description": "New capability request" },
  { "name": "Task", "description": "General task" }
]
```

### 4.3 空值情況

若 org 尚未啟用 Issue Types 或 PAT 無 scope：

```json
[]
```

前端 fallback：隱藏 type 下拉選單，Worker 不帶 type。

### 4.4 .gitignore

目前 `public/data/**/*.json` 已被 gitignore（CI 產物）。新檔案 `issue-types.json` 符合此 pattern，不需額外 gitignore 規則。

---

## 5. Worker API Envelope（新 schema，獨立於 types.ts）

Worker 不是 SPA 的一部分，其 API envelope 不屬於 `types.ts` 的契約。定義於此方便 planner / implementer 對齊。

### 5.1 Request Schema — 建立 issue

**Endpoint**：`POST <WORKER_URL>/api/v1/repos/:name/issues`

**Request body（JSON）**：

```ts
interface CreateIssueRequest {
  /** Issue 標題，trim 後 1..100 字 */
  title: string;
  /** Issue 內容（Markdown），1..5000 字 */
  body: string;
  /** GitHub Issue Type 名稱，需在 issue-types.json 清單內；若 org 未啟用則可省略 */
  type?: string;
  /** 從 Turnstile Managed widget 取得的 token */
  turnstileToken: string;
}
```

> **Path param** 的 `:name` 是 repo short name（例如 `example-repo`），Worker 內部拼 `zenbuapps/:name` 去呼 GitHub。

### 5.2 Request Schema — 留言

**Endpoint**：`POST <WORKER_URL>/api/v1/repos/:name/issues/:number/comments`

**Request body**：

```ts
interface CreateCommentRequest {
  /** 留言內容（Markdown），1..5000 字 */
  body: string;
  /** 從 Turnstile Managed widget 取得的 token */
  turnstileToken: string;
}
```

### 5.3 Response Envelope（統一）

```ts
// 成功
interface SuccessResponse<T> {
  success: true;
  data: T;
}

// 失敗
interface ErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;  // human-readable zh-Hant
  };
}

type ErrorCode =
  | 'TURNSTILE_FAILED'    // 403
  | 'CORS_REJECTED'       // 403
  | 'INVALID_PAYLOAD'     // 400
  | 'REPO_NOT_ALLOWED'    // 403
  | 'UPSTREAM_ERROR'      // 502
  | 'RATE_LIMITED';       // 429
```

### 5.4 Response Data Shape

**建立 issue 成功**：

```ts
interface CreateIssueData {
  number: number;       // GitHub issue number
  htmlUrl: string;      // GitHub UI URL
  title: string;        // 實際存到 GitHub 的 title（trim 後）
  type: string | null;  // 實際存到 GitHub 的 type
  labels: string[];     // 實際附加的 labels（含 "待審核"）
}
```

**留言成功**：

```ts
interface CreateCommentData {
  id: number;           // GitHub comment ID
  htmlUrl: string;      // 帶 #issuecomment-{id} 錨點的 URL
}
```

### 5.5 HTTP Status Code 對照

| 情境 | HTTP | envelope `code` |
|------|------|-----------------|
| 建立 issue 成功 | 201 Created | — |
| 留言成功 | 201 Created | — |
| Turnstile 驗證失敗 | 403 Forbidden | TURNSTILE_FAILED |
| Origin 非白名單 | 403 Forbidden | CORS_REJECTED |
| Body 欄位缺失 / 超長 / type 不在清單 | 400 Bad Request | INVALID_PAYLOAD |
| Target repo 不可提交 | 403 Forbidden | REPO_NOT_ALLOWED |
| GitHub 回 5xx | 502 Bad Gateway | UPSTREAM_ERROR |
| GitHub 或 Worker rate limit | 429 Too Many Requests | RATE_LIMITED |
| Worker 未預期錯誤 | 500 Internal Server Error | `INTERNAL`（未在主集合，fallback） |

---

## 6. 契約演化的跨端檢查清單

每次 merge 涉及 `types.ts` 的 PR 前，必須依 `.claude/rules/data-contract.rule.md` 檢查：

### 6.1 Pre-flight

- [ ] `src/data/types.ts` 的 `IssueLite.type` 欄位已加入
- [ ] `src/data/types.ts` 的 `RepoSummary.canSubmitIssue` 欄位已加入
- [ ] 新增 `IssueType` interface 並 export

### 6.2 Fetcher 同步

- [ ] `scripts/fetch-data.ts::toIssueLite` 讀 `issue.type?.name ?? null`
- [ ] `scripts/fetch-data.ts::toRepoSummary` 計算 `canSubmitIssue`
- [ ] `scripts/fetch-data.ts::main` 末尾產出 `public/data/issue-types.json`
- [ ] 本地 run `GH_TOKEN=xxx pnpm run fetch-data` → 檢查 JSON 含新欄位：
  ```bash
  cat public/data/summary.json | head -50   # RepoSummary.canSubmitIssue 應存在
  cat public/data/repos/<name>.json | head  # IssueLite.type 應存在（可能為 null）
  cat public/data/issue-types.json          # 應為陣列
  ```

### 6.3 Loader 同步

- [ ] `src/data/loader.ts::loadIssueTypes` 新增
- [ ] `loader.ts` 的 `clearDataCache()` 也要清 `issueTypesCache`

### 6.4 消費端同步

使用 Grep / Serena 找出所有使用點：

- [ ] `IssueList.tsx`（顯示 type badge）
- [ ] `RepoCard.tsx`（顯示「可提交」提示）
- [ ] `OverviewPage.tsx`（依 canSubmitIssue 分區）
- [ ] `RoadmapPage.tsx`（控制「建立 issue」按鈕可見性）
- [ ] 新 Modal 元件（讀 loadIssueTypes）

### 6.5 TypeScript / Build 驗證

- [ ] `pnpm typecheck` 三個 project reference 全綠
- [ ] `pnpm build` 通過
- [ ] 本地 `pnpm preview` 手動驗證 UI 沒 crash

---

## 7. Migration 次序建議（給 implementer）

1. **先改 `types.ts`**（加欄位）
2. **改 `fetch-data.ts`**（讀 issue.type、計算 canSubmitIssue、寫 issue-types.json）
3. **改 `loader.ts`**（加 loadIssueTypes）
4. **改消費端**（IssueList → RepoCard → OverviewPage → RoadmapPage 依 UI hierarchy 順序）
5. **新建 Modal / Worker code**
6. **CI workflow 擴充**（加 worker deploy job）
7. **repo secret 補齊**（新的 Turnstile / Cloudflare secrets）

順序顛倒（例：先改消費端）會讓 TS compiler 報一堆 error，不阻礙但噪音多。

---

## 8. 與既有規則的交叉引用

- `.claude/rules/data-contract.rule.md` 的「強制規範 1-6」全部適用於本 spec 的欄位新增
- 特別注意既有規範：
  - **4. `IssueLite.labels` 的 `name` 保證非空**：樂觀更新組 `IssueLite` 時，從 Worker response 的 labels 陣列（都是字串）組出 IssueLabel 物件，`name` 直接 assign（非空）、`color` 預設 `'888888'`
  - **5. `labels[].color` 格式是 6 位 hex**：`'888888'` 合規
  - **6. `Summary.repos` 排序是契約一部分**：V1 新增的 canSubmitIssue 不影響排序規則，排序仍依 `hasMilestones desc, name asc`
