---
version: 0.1.0
date: 2026-04-18
status: draft
scope: V1
---

# Requirements — Visitor Issue Submission

本檔案以 **FR-###**（Functional Requirement）與 **NFR-###**（Non-Functional Requirement）編號列出所有需求。每條需求對應一或多條驗收標準（見 `acceptance-criteria.md`）。

---

## Functional Requirements

### FR-001 — 訪客可在 Modal 中建立 issue

**描述**：訪客進入某 repo 的 RoadmapPage 且該 repo 滿足 `canSubmitIssue === true` 時，應看見「建立 issue」按鈕；點擊後開啟 Modal 對話框，填入 `title` / `body` / `type` 後送出，Modal 顯示成功訊息並自動關閉。

**對應決策**：Q4（Worker proxy）、Q6（訪客可建立 issue）、Q13（Modal）、Q14（Issue Types）、Q19（canSubmitIssue）

---

### FR-002 — 訪客可對現有 issue 留言

**描述**：RoadmapPage 的 `MilestoneNode` 展開後顯示 `IssueList`，每個 issue 項目應有「留言」按鈕；點擊後開啟留言 Modal，填入 `body` 後送出，Modal 顯示成功訊息並自動關閉。

**對應決策**：Q6、Q11（留言混合方案）、Q13

---

### FR-003 — 建立 issue 的欄位與限制

**描述**：建立 issue Modal 必須提供以下欄位，每個欄位前端強制驗證：

| 欄位 | 類型 | 限制 |
|------|------|------|
| `title` | 單行文字 | 必填，1 ≤ 長度 ≤ 100 字（UTF-16 code units） |
| `body` | Markdown 多行文字 | 必填，1 ≤ 長度 ≤ 5000 字 |
| `type` | 下拉選單 | 必填，值來自 `public/data/issue-types.json`；若該檔案為空或載入失敗則此欄位隱藏且送出時不帶 type |

送出前前端須做以下事情：
- 將 `### 舉報聯絡方式\n(選填) Email / GitHub handle：` template 預填在 body 欄位頂端（使用者可編輯或刪除）
- Trim `title` 兩端空白後再驗證長度
- Turnstile 未通過 → 無法送出（送出按鈕 disabled）

**對應決策**：Q7、Q14、Q15

---

### FR-004 — 留言 issue 的欄位與限制

**描述**：留言 Modal 只有 `body` 一個欄位，限制與 FR-003 相同（1 ≤ 長度 ≤ 5000 字）。不套用 issue body template（留言用途不同）。

**對應決策**：Q6、Q11

---

### FR-005 — 寫入請求皆經 Cloudflare Worker

**描述**：所有寫入 GitHub 的操作（建立 issue、留言）一律透過 Cloudflare Worker 代理。前端發送 `POST <WORKER_URL>/api/v1/issues` 或 `POST <WORKER_URL>/api/v1/issues/{issue_number}/comments`，Worker 驗證後代呼 GitHub REST API，回傳結果。

**禁止**：前端直接呼叫 `api.github.com`；`ZENBU_ORG_WRITE_TOKEN` 絕不出現在前端 bundle 或瀏覽器。

**對應決策**：Q1 / Q4（Worker 覆蓋 repository_dispatch）

---

### FR-006 — 寫入前必須通過 Cloudflare Turnstile

**描述**：
- **Site Key**（公開）從 `VITE_TURNSTILE_SITE_KEY` 環境變數注入前端，Managed widget 嵌在 Modal 內
- 前端取得 Turnstile token 後隨 request 一起送到 Worker
- Worker 呼叫 `https://challenges.cloudflare.com/turnstile/v0/siteverify` 驗證 token；失敗 → 回 `403` 並帶錯誤代碼
- 前端收到 403 / turnstile 錯誤時，在 Modal 內 inline 顯示錯誤訊息，不跳出 Modal、不 reload

**對應決策**：Q4、Q17

---

### FR-007 — Worker 必須強制附加 `待審核` label

**描述**：Worker 在建立 issue 的 request body 內，**無論前端有無帶 labels**，都必須將字串 `待審核` 加入 labels 陣列（重複值 GitHub 會自動去重）。前端無法跳過此 label。

**實作細節**：
- Label 名稱為 UTF-8 中文字 `待審核`（**Q16 用戶選中文，覆蓋英文 `triage-pending`**）
- 若該 label 尚未存在於目標 repo，Worker 應在首次建立 issue 失敗時先呼叫 `POST /repos/{owner}/{repo}/labels` 建立一次，再重試建立 issue
- Worker 呼叫 GitHub API 時使用 `@octokit/rest`，labels 陣列傳遞時由 Octokit 自動處理 UTF-8 encoding（無需手動 URL-encode payload）；若未來改用裸 `fetch`，URL path / query 的中文字需手動 `encodeURIComponent`

**對應決策**：Q7、Q14、Q16

---

### FR-008 — Issue 類型來自 GitHub Issue Types

**描述**：建立 issue 時的 `type` 欄位值域來自 `zenbuapps` org 的 Issue Types 設定（於 2024/09 GA，2025-03-18 REST API GA）。

- Worker 或 fetcher 於 build-time 呼叫 `GET /orgs/{org}/issue-types`，將清單寫入 `public/data/issue-types.json`
- 前端讀 `issue-types.json` 填入下拉選單
- Worker 建立 issue 時將 `type` 值放入 request body 的 `type` 欄位（字串，例如 `"Bug"`）
- 若 org 尚未啟用 Issue Types 或清單為空 → 前端隱藏 type 欄位，Worker 建立 issue 時不帶 type

**對應決策**：Q14

---

### FR-009 — `canSubmitIssue` 語意與計算

**描述**：`RepoSummary.canSubmitIssue: boolean` 為新增欄位，語意「該 repo 可接受訪客提交 issue / 留言」。

V1 規則（於 `scripts/fetch-data.ts::buildRepoSummary` 計算）：

```
canSubmitIssue = !repo.isPrivate && milestones.length > 0
```

**對應決策**：Q19

---

### FR-010 — OverviewPage 依 `canSubmitIssue` 分兩區塊

**描述**：OverviewPage 的 RepoCard 列表拆為兩區塊：

1. **「接受訪客提交」**：`canSubmitIssue === true` 的 repo，顯示為完整 RepoCard grid（沿用現有樣式，額外在 RepoCard 內加入「在此建立 issue」提示 / CTA）
2. **「僅供瀏覽」**（折疊，預設收合）：`canSubmitIssue === false` 的 repo，延用現有「其他 repos（無 milestone）」的折疊樣式，點擊外連到 GitHub，**不顯示建立 issue 入口**

**對應決策**：Q19

---

### FR-011 — RoadmapPage 的「建立 issue」按鈕條件可見

**描述**：RoadmapPage 右上角的「建立 issue」按鈕僅在 `canSubmitIssue === true` 時可見。`canSubmitIssue === false` 時不顯示按鈕（不使用 disabled 狀態，直接 hide），避免困惑。

**對應決策**：Q19

---

### FR-012 — 送出後的樂觀更新 UX

**描述**：寫入成功後：

- **建立 issue**：Modal 關閉 → Toast 通知「issue 已建立」+ 連結到新 issue 的 GitHub URL → 前端在本地 state 中 append 新 issue 到對應 milestone 的 issues 陣列（使用 Worker 回傳的 `number` / `html_url` / `title` 等欄位，type / labels 以前端表單值為準）
- **留言**：Modal 關閉 → Toast 通知「留言已送出」→ 前端不更新本地 state（`IssueLite` 不含 comments 欄位，無處可更）

下一小時 fetcher 重跑後，`public/data/*.json` 會同步真實狀態，瀏覽器 refresh 即覆蓋樂觀更新。

**對應決策**：Q11、Q12

---

### FR-013 — 媒體上傳的教育提示

**描述**：Markdown 編輯器（`@uiw/react-md-editor`）旁邊須有固定可見的提示區塊，內容（zh-Hant）：

> 目前暫不支援圖片 / 影片上傳。請先將媒體上傳至 [imgur](https://imgur.com/) / [YouTube](https://youtube.com/) / 任一公開 GitHub Issue，再將連結貼回此處。

提示區塊需有明確的視覺層次（使用 `--color-surface-overlay` 底色 + `text-text-muted` 文字），不可被使用者關閉。

**對應決策**：Q3

---

### FR-014 — Worker CORS 白名單

**描述**：Worker 必須只允許以下 Origin 發起請求（Access-Control-Allow-Origin header）：

- `https://zenbuapps.github.io`
- `http://localhost:5173`（Vite dev）
- `http://localhost:4173`（Vite preview）

其他 Origin → 回 `403 Forbidden`，不設 CORS header（瀏覽器自然拒絕）。

**對應決策**：Q18

---

### FR-015 — Worker 錯誤回應的統一 envelope

**描述**：Worker 所有失敗回應（4xx / 5xx）統一為：

```json
{
  "success": false,
  "error": {
    "code": "<ERROR_CODE>",
    "message": "<human-readable zh-Hant>"
  }
}
```

錯誤代碼最小集合：

| `code` | HTTP | 語意 |
|--------|------|------|
| `TURNSTILE_FAILED` | 403 | Turnstile 驗證失敗 |
| `CORS_REJECTED` | 403 | Origin 不在白名單 |
| `INVALID_PAYLOAD` | 400 | 欄位缺失、超長、type 不在 issue-types 清單 |
| `REPO_NOT_ALLOWED` | 403 | 目標 repo 的 `canSubmitIssue=false` |
| `UPSTREAM_ERROR` | 502 | GitHub API 回 5xx / 429 / 401 |
| `RATE_LIMITED` | 429 | Worker 自身或 GitHub 的 rate limit |

**對應決策**：Q4、Q18 衍生

---

### FR-016 — Worker 成功回應的統一 envelope

**描述**：

建立 issue 成功：
```json
{
  "success": true,
  "data": {
    "number": 42,
    "htmlUrl": "https://github.com/zenbuapps/xxx/issues/42",
    "title": "...",
    "type": "Bug",
    "labels": ["待審核", "..."]
  }
}
```

留言成功：
```json
{
  "success": true,
  "data": {
    "id": 12345,
    "htmlUrl": "https://github.com/zenbuapps/xxx/issues/42#issuecomment-12345"
  }
}
```

**對應決策**：Q11、Q12

---

## Non-Functional Requirements

### NFR-001 — 寫入延遲 P95 < 3 秒

**描述**：訪客點送出到 Worker 回傳結果的 P95 延遲應 < 3 秒（Modal 不應顯示 loading 超過 3 秒 P95）。

**量測點**：前端 fetch 開始 → 收到 response。不含 Turnstile 前端 challenge 時間（Managed widget 通常 < 1 秒）。

**理由**：GitHub REST API P95 通常 < 1 秒，Worker edge 網路再加 < 500ms，3 秒已留足餘地。

---

### NFR-002 — 前端 bundle 不得包含寫入 PAT

**描述**：`ZENBU_ORG_WRITE_TOKEN` 只存在於 Cloudflare Worker 的 wrangler secret。前端 bundle（`dist/`）grep 任何子字串都**不應**匹配到該 PAT。

**量測方法**：CI 在 Pages deploy 前執行：
```bash
! grep -rE 'ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{80,}' dist/
```

---

### NFR-003 — Turnstile Secret Key 只在 Worker

**描述**：`TURNSTILE_SECRET_KEY` 只存在於 Worker 的 wrangler secret。前端 bundle grep `TURNSTILE_SECRET` 不得匹配。前端 bundle 中的 `VITE_TURNSTILE_SITE_KEY`（Site Key）則為公開值，可出現。

---

### NFR-004 — Worker 使用免費額度

**描述**：V1 使用 Cloudflare Workers 免費方案：
- 每日 100,000 requests（Worker 執行）
- `*.workers.dev` 子域（無 custom domain 費用）

若 traffic 超過免費額度 → 列入 `open-questions.md` 的 V2 項目。

---

### NFR-005 — CORS 實作為純白名單（非 wildcard）

**描述**：Worker 回傳 `Access-Control-Allow-Origin` header 時必須精確回傳**實際 request 的 Origin**（若在白名單內），不可回 `*`。

**理由**：若帶 credentials 或要啟用 preflight cache，`*` 會被瀏覽器拒絕。

---

### NFR-006 — 訪客對 Modal 的操作不應阻塞頁面

**描述**：Modal 採 portal 方式 render（`createPortal` to `document.body`），不影響 RoadmapPage 的捲動與載入。Modal 打開時 body overflow 鎖定，關閉後還原。

---

### NFR-007 — Markdown 編輯器載入策略

**描述**：`@uiw/react-md-editor` 體積較大（含 `marked` / `codemirror` 或類似），必須以 **lazy chunk** 方式載入，不拖慢 OverviewPage / RoadmapPage 的 initial paint。

**實作提示**：`const MdEditor = lazy(() => import('@uiw/react-md-editor'))`，並以 `<Suspense fallback={<LoadingSpinner />}>` 包裹 Modal 內部。

---

### NFR-008 — 新依賴不影響既有 pnpm-lock

**描述**：新增的 npm 套件（`@uiw/react-md-editor` 等）必須透過 `pnpm add` 安裝，同步更新 `pnpm-lock.yaml`；**禁止**使用 `npm install` / `yarn`（遵循 `pnpm-and-ci.rule.md`）。

---

### NFR-009 — PAT 權限最小化

**描述**：

| PAT | Scope | 位置 |
|-----|-------|------|
| `ZENBU_ORG_READ_TOKEN`（維持不變） | Contents / Issues / Metadata：Read-only | GitHub Actions secret |
| `ZENBU_ORG_WRITE_TOKEN`（新） | Issues：Read + Write；Metadata：Read；（若由 Worker 負責列 issue-types）Organization administration：Read-only | Cloudflare Worker wrangler secret |

**理由**：職責分離。Read PAT 洩漏 → 最多公開唯讀；Write PAT 洩漏 → 限縮在 issues 範圍，不影響 repo code / admin。

---

### NFR-010 — 前端 i18n 一致（繁中）

**描述**：所有新增 UI 文案（Modal 標題、按鈕、錯誤訊息、教育提示、Toast）一律 zh-Hant。`aria-label` / placeholder 亦同。遵循 `styling-system.rule.md` 的 zh-Hant 規則。

---

### NFR-011 — 對既有「沒有 runtime API」定位的更新

**描述**：CLAUDE.md 第 11 行「沒有 runtime API」描述在引入 Worker 後不再成立。planner / implementer 階段必須**同步更新** CLAUDE.md，加入 Worker 的定位說明（見 `deployment.md` 尾段）。

---

### NFR-012 — Worker 的可觀測性

**描述**：Worker 必須使用 `console.log` / `console.error` 輸出結構化 log（JSON）：

```json
{ "type": "request", "path": "/api/v1/issues", "repo": "foo", "origin": "...", "turnstileOk": true, "upstreamStatus": 201, "durationMs": 742 }
```

Cloudflare Dashboard → Workers → Logs 可即時查看。不需自建 APM。

---

### NFR-013 — OverviewPage / RoadmapPage 對 `canSubmitIssue` 缺失的向後相容

**描述**：若 `summary.json` 或 `repos.json` 中的 `RepoSummary` 物件意外缺 `canSubmitIssue`（例如舊 fetcher 版本部署時尚未重跑），前端應視為 `false`（保守預設：不顯示提交入口），不應 crash 或拋錯。

**實作提示**：`repo.canSubmitIssue === true`（三等號明確比對 `true`）。

---

## 需求與 ADR 對照

| FR / NFR | ADR（`architecture.md`） |
|----------|--------------------------|
| FR-005 | ADR-001（寫入管道） |
| FR-006 / FR-017（含 Turnstile 相關） | ADR-002（Turnstile 接法） |
| FR-008 / FR-007 | ADR-003（Issue 分類機制） |
| FR-010 / FR-011 / FR-009 | ADR-004（`canSubmitIssue` 決策） |
| NFR-004 | ADR-005（Worker 部署域名） |
| NFR-009 | ADR-006（PAT 雙 token 策略） |
