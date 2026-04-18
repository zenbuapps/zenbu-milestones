---
version: 0.1.0
date: 2026-04-18
status: draft
format: Gherkin (Given / When / Then)
---

# Acceptance Criteria — Visitor Issue Submission

所有驗收標準以 **Gherkin** 格式撰寫。每組對應 `requirements.md` 的 FR / NFR 編號；測試實作階段可直接改成 Playwright / Vitest / Cucumber scenarios。

> ⚠️ **語言約定**：
> - Feature / Rule / Example / Given / When / Then / And / But 為保留關鍵字（英文）
> - 所有描述文字（情境、期望結果）為 zh-Hant
> - 本檔案為**驗收標準**（非正式 Feature File），不使用 `@ignore` / `@command` / `@query` tag

---

## AC-Group 1：建立 Issue 流程（FR-001 / FR-003 / FR-005 / FR-007 / FR-008）

```gherkin
Feature: 訪客建立 issue（V1）

  Background:
    Given zenbuapps org 已啟用 Issue Types 功能並定義了 "Bug" / "Feature" / "Task" 三個 type
    And `public/data/issue-types.json` 包含上述三個 type
    And `public/data/repos/example-repo.json` 存在且該 repo 的 RepoSummary.canSubmitIssue = true
    And Cloudflare Worker 已部署，`TURNSTILE_SECRET_KEY` 與 `ZENBU_ORG_WRITE_TOKEN` 均已設定

  Rule: RoadmapPage 應在 canSubmitIssue=true 時顯示「建立 issue」按鈕

    Example: 進入可提交 repo 的 RoadmapPage
      Given 我是匿名訪客
      When 我導航到 "#/repo/example-repo"
      Then RoadmapPage 右上角顯示「建立 issue」按鈕
      And 按鈕使用 `btn-primary` 樣式

    Example: 進入不可提交 repo 的 RoadmapPage
      Given `example-private-repo` 的 canSubmitIssue = false
      When 我導航到 "#/repo/example-private-repo"
      Then RoadmapPage 不顯示「建立 issue」按鈕
      And 頁面其他部分正常渲染

  Rule: 建立 issue Modal 必須包含 title / body / type 三個必填欄位

    Example: 開啟 Modal 看到預設狀態
      Given 我在 "#/repo/example-repo"
      When 我點擊「建立 issue」按鈕
      Then Modal 在 200ms 內開啟
      And Modal 顯示 title 輸入欄（單行、placeholder "簡短描述..."）
      And Modal 顯示 body 輸入欄（@uiw/react-md-editor）
      And body 欄的預設值為 "### 舉報聯絡方式\n(選填) Email / GitHub handle："
      And Modal 顯示 type 下拉選單，選項為 "Bug" / "Feature" / "Task"
      And Modal 顯示 Turnstile Managed widget
      And Modal 顯示「媒體上傳」教育提示區塊
      And「送出」按鈕為 disabled 狀態

  Rule: 前端強制驗證欄位長度與 Turnstile

    Example: title 為空時送出按鈕 disabled
      Given Modal 已開啟
      And 我已選 type = "Bug"
      And 我在 body 欄填入合法內容
      And Turnstile 已通過
      When title 欄位為空字串
      Then「送出」按鈕為 disabled

    Example: title 超過 100 字時顯示錯誤
      Given Modal 已開啟
      When 我在 title 欄貼入 101 字的字串
      Then title 欄下方顯示紅字「標題不得超過 100 字（目前 101 字）」
      And「送出」按鈕為 disabled

    Example: body 超過 5000 字時顯示錯誤
      Given Modal 已開啟
      When 我在 body 欄填入 5001 字的 Markdown
      Then body 編輯器下方顯示紅字「內容不得超過 5000 字（目前 5001 字）」
      And「送出」按鈕為 disabled

    Example: Turnstile 未通過時送出按鈕 disabled
      Given Modal 已開啟
      And 我已填完 title / body / type
      And Turnstile challenge 尚未完成
      Then「送出」按鈕為 disabled

  Rule: 送出成功後 Modal 關閉並顯示 Toast

    Example: 合法送出 → 201 Created
      Given Modal 已開啟
      And title = "按鈕點擊無反應"
      And body 包含合法 Markdown（含「舉報聯絡方式」template）
      And type = "Bug"
      And Turnstile token 有效
      When 我點擊「送出」
      Then 前端對 Worker 發送 POST "<WORKER_URL>/api/v1/repos/example-repo/issues"
      And request body 包含 { title, body, type, turnstileToken, repo: "example-repo" }
      And Worker 回應 201 Created 與 { success: true, data: { number, htmlUrl, title, type, labels } }
      And Worker 已在 labels 中強制附加 "待審核"
      And Modal 在 500ms 內關閉
      And 頁面右下角顯示 Toast「issue #<number> 已建立」含連結到 htmlUrl
      And RoadmapPage 對應 milestone 的 issues 陣列立即 append 這個新 issue（樂觀更新）

  Rule: Worker 端必須強制附加「待審核」label

    Example: 即使前端 request 不帶 labels，Worker 也要補上「待審核」
      Given 前端送出的 request body 不含 labels 欄位
      When Worker 處理此 request
      Then Worker 呼叫 `POST /repos/zenbuapps/example-repo/issues` 時 labels 陣列為 ["待審核"]

    Example: 前端送 labels=["my-label"]，Worker 合併出 ["my-label", "待審核"]
      Given 前端送出 labels=["my-label"]（即使 V1 UI 不給用戶選 labels，Worker 仍需處理異常 payload）
      When Worker 處理此 request
      Then Worker 呼叫 GitHub 時 labels 陣列至少含 "待審核"（重複值 GitHub 自動去重）
```

---

## AC-Group 2：留言流程（FR-002 / FR-004 / FR-005 / FR-012）

```gherkin
Feature: 訪客對現有 issue 留言（V1）

  Background:
    Given 我在 "#/repo/example-repo"
    And example-repo 有 milestone "v1.0"，其下 issue #42 標題為 "登入按鈕不動"

  Rule: 展開 issue 後顯示「留言」按鈕

    Example: 從 MilestoneNode 展開 issue list
      Given v1.0 milestone 預設展開
      When 我點擊 issue #42 的「留言」按鈕
      Then 留言 Modal 開啟
      And Modal 標題為 "對 #42 留言"
      And Modal 只有 body 輸入欄（@uiw/react-md-editor）
      And Modal 不顯示 title / type 欄位
      And body 欄預設為空（不套用建立 issue 的 template）

  Rule: 留言欄位限制與 FR-003 body 相同

    Example: 空 body 時送出按鈕 disabled
      Given 留言 Modal 開啟
      When body 欄為空字串
      Then「送出」按鈕為 disabled

    Example: body 超長時顯示錯誤
      Given 留言 Modal 開啟
      When 我在 body 貼入 5001 字的內容
      Then 顯示紅字錯誤
      And「送出」按鈕為 disabled

  Rule: 送出成功後 Toast 並關閉 Modal（不更新本地 state）

    Example: 留言成功
      Given body = "我也遇到這個問題，環境是 macOS 14.5"
      And Turnstile token 有效
      When 我點擊「送出」
      Then 前端對 Worker 發送 POST "<WORKER_URL>/api/v1/repos/example-repo/issues/42/comments"
      And request body 包含 { body, turnstileToken, repo: "example-repo", issueNumber: 42 }
      And Worker 回應 201 Created 與 { success: true, data: { id, htmlUrl } }
      And Modal 關閉
      And 顯示 Toast「留言已送出」含連結到 htmlUrl
      And RoadmapPage 的本地 state 不變（IssueLite 不含 comments 欄位）
```

---

## AC-Group 3：Turnstile 與錯誤處理（FR-006 / FR-015）

```gherkin
Feature: Turnstile 驗證與錯誤 inline 顯示

  Rule: Turnstile 驗證失敗時 Modal 不關閉，inline 顯示錯誤

    Example: Worker 回 403 TURNSTILE_FAILED
      Given 我已在 Modal 填完所有欄位
      And Turnstile widget 回傳一個 token（前端看來有效）
      When 我點擊「送出」
      And Worker 向 Cloudflare siteverify 驗證時被拒（token 過期或重用）
      And Worker 回應 403 { success: false, error: { code: "TURNSTILE_FAILED", message: "..." } }
      Then Modal 不關閉
      And Modal 在送出按鈕上方顯示紅字「驗證失敗，請重新驗證後再試」
      And 紅字旁顯示 AlertCircle 圖示（lucide-react, size 16）
      And 所有表單欄位內容保留
      And Turnstile widget reset（使用者可重新 challenge）

  Rule: CORS 被拒的行為

    Example: 非白名單 Origin 呼叫 Worker
      Given Origin = "https://evil.example.com"
      When 送出 POST "/api/v1/repos/example-repo/issues"
      Then Worker 回應 403 { success: false, error: { code: "CORS_REJECTED", message: "..." } }
      And response header 不含 Access-Control-Allow-Origin
      And 瀏覽器 console 顯示 CORS error

  Rule: 目標 repo 不允許提交時 Worker 拒絕

    Example: private repo 被手動 POST 繞過前端
      Given 攻擊者直接 curl Worker，repo = "example-private-repo"
      And example-private-repo 的 canSubmitIssue = false
      When Worker 處理此 request
      Then Worker 回應 403 { success: false, error: { code: "REPO_NOT_ALLOWED", message: "該 repo 不接受外部提交" } }
      And Worker 不呼叫 GitHub API

  Rule: Payload 驗證失敗

    Example: title 超過 100 字（繞過前端）
      Given 前端的長度檢查被 bypass，送出 title = 150 字
      When Worker 處理此 request
      Then Worker 回應 400 { code: "INVALID_PAYLOAD", message: "title 長度不合法" }
      And Worker 不呼叫 GitHub API

    Example: type 不在 issue-types 清單
      Given 前端送出 type = "Spam"，但 org 只有 Bug / Feature / Task
      When Worker 處理此 request
      Then Worker 回應 400 { code: "INVALID_PAYLOAD", message: "type 不在允許清單內" }

  Rule: GitHub 上游錯誤的處理

    Example: GitHub 回 5xx
      Given 所有前置檢查通過
      When GitHub API 回應 500 或 503
      Then Worker 回應 502 { code: "UPSTREAM_ERROR", message: "GitHub API 暫時無法使用，請稍後再試" }
      And Worker log 記錄 upstreamStatus 數字

    Example: GitHub 回 rate limit（429）
      Given 所有前置檢查通過
      When GitHub API 回應 429 或 403 with x-ratelimit-remaining: 0
      Then Worker 回應 429 { code: "RATE_LIMITED", message: "..." }
```

---

## AC-Group 4：OverviewPage 分區（FR-009 / FR-010）

```gherkin
Feature: OverviewPage 依 canSubmitIssue 分區

  Background:
    Given summary.json 包含：
      | name              | isPrivate | milestoneCount | canSubmitIssue |
      | public-with-ms    | false     | 3              | true           |
      | public-no-ms      | false     | 0              | false          |
      | private-with-ms   | true      | 2              | false          |
      | private-no-ms     | true      | 0              | false          |

  Rule: 「接受訪客提交」區塊只顯示 canSubmitIssue=true 的 repo

    Example: 載入 OverviewPage
      When 我導航到 "/"
      Then「接受訪客提交」區塊的 RepoCard grid 包含 "public-with-ms"
      And RepoCard 上有「可在此建立 issue」提示或 badge
      And 不包含 "public-no-ms" / "private-with-ms" / "private-no-ms"

  Rule: 「僅供瀏覽」折疊區塊包含 canSubmitIssue=false 的 repo

    Example: 折疊區塊預設收合
      When 我導航到 "/"
      Then「僅供瀏覽（N 個）」標題可見（N=3）
      And 折疊區塊預設 collapsed
      And 展開後顯示 "public-no-ms" / "private-with-ms" / "private-no-ms" 的列表
      And 點擊列表項目外連到 GitHub（不進 RoadmapPage）

  Rule: canSubmitIssue 缺失時視為 false

    Example: 舊版 summary.json 無此欄位
      Given summary.json 的 "public-with-ms" 物件中缺 canSubmitIssue 欄位
      When 前端載入並渲染 OverviewPage
      Then "public-with-ms" 出現在「僅供瀏覽」區塊
      And 頁面不 crash
      And console 無 Uncaught error
```

---

## AC-Group 5：資料契約（FR-007 / FR-008 / FR-009，對應 `data-contract.md`）

```gherkin
Feature: types.ts 與 JSON 契約變更

  Rule: IssueLite 新增 type 欄位（nullable）

    Example: 新 issue 帶 type
      Given Fetcher 抓到一個 issue，GitHub response 含 "type": { "name": "Bug" }
      When Fetcher 轉為 IssueLite
      Then IssueLite.type === "Bug"

    Example: 舊 issue 無 type
      Given Fetcher 抓到一個 issue，GitHub response 無 type 欄位
      When Fetcher 轉為 IssueLite
      Then IssueLite.type === null

  Rule: RepoSummary 新增 canSubmitIssue 欄位（boolean）

    Example: 公開且有 milestone
      Given repo: { isPrivate: false, milestones: [ms1, ms2] }
      When Fetcher 計算 RepoSummary
      Then RepoSummary.canSubmitIssue === true

    Example: 公開但無 milestone
      Given repo: { isPrivate: false, milestones: [] }
      When Fetcher 計算 RepoSummary
      Then RepoSummary.canSubmitIssue === false

    Example: 私有即便有 milestone
      Given repo: { isPrivate: true, milestones: [ms1] }
      When Fetcher 計算 RepoSummary
      Then RepoSummary.canSubmitIssue === false

  Rule: issue-types.json 產出規則

    Example: org 啟用 Issue Types
      Given zenbuapps org 定義了 Bug / Feature / Task
      When Fetcher 呼叫 GET /orgs/zenbuapps/issue-types
      Then public/data/issue-types.json 內容為
        """
        [
          { "name": "Bug", "description": "..." },
          { "name": "Feature", "description": "..." },
          { "name": "Task", "description": "..." }
        ]
        """

    Example: org 尚未啟用 Issue Types
      Given GitHub API 回 404 or 空陣列
      When Fetcher 處理結果
      Then public/data/issue-types.json 內容為 "[]"
      And Modal 前端隱藏 type 欄位
```

---

## AC-Group 6：部署與安全（NFR-002 / NFR-003 / NFR-009，對應 `deployment.md`）

```gherkin
Feature: 部署與安全保證

  Rule: 前端 bundle 絕不包含寫入 PAT

    Example: CI build 後掃描 dist/
      Given 已執行 `pnpm run build`
      When CI 執行 "! grep -rE 'ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{80,}' dist/"
      Then 結果為 0 match（command exit code = 0，`!` 反轉）
      And CI step 通過

  Rule: Worker 使用獨立 PAT（職責分離）

    Example: 設定 wrangler secret
      When 執行 `wrangler secret put ZENBU_ORG_WRITE_TOKEN`
      Then Worker 於 runtime 可透過 `env.ZENBU_ORG_WRITE_TOKEN` 取得
      And ZENBU_ORG_READ_TOKEN 不存在於 Worker env（只存在於 GitHub Actions）

  Rule: CI 同時部署 Pages 與 Worker

    Example: push 到 master
      Given `.github/workflows/build-and-deploy.yml` 含兩個 job: deploy-pages / deploy-worker
      When push 到 master
      Then deploy-worker job 使用 cloudflare/wrangler-action@v3 部署
      And deploy-pages job 依賴 deploy-worker（或並行但 Worker 失敗時 Pages 不生效）

  Rule: `VITE_TURNSTILE_SITE_KEY` 於 build-time 注入

    Example: CI build
      Given repo secret VITE_TURNSTILE_SITE_KEY 已設定
      When CI 執行 `pnpm run build`
      Then 前端 bundle 含該 site key（公開，無安全風險）
      And 前端在 Modal 中以此 key 初始化 Turnstile Managed widget
```

---

## AC-Group 7：效能 / 可用性（NFR-001 / NFR-007）

```gherkin
Feature: 效能與載入策略

  Rule: Markdown 編輯器 lazy load

    Example: OverviewPage / RoadmapPage initial paint
      Given 使用者首次進入 OverviewPage
      When 頁面載入完成
      Then @uiw/react-md-editor 的 JS chunk 尚未下載（Network panel 可驗證）
      And initial bundle size 不超過編輯器不存在時的 10%

    Example: 開啟 Modal 時才載入
      Given 使用者已在 RoadmapPage
      When 點擊「建立 issue」按鈕
      Then 瀏覽器開始 fetch md-editor chunk
      And Modal 顯示 LoadingSpinner，chunk 載入完成後編輯器顯示（通常 < 500ms）

  Rule: 寫入延遲 P95 < 3 秒

    Example: 成功寫入的時間量測
      Given 我點擊「送出」
      When 量測從 fetch 發起到 response 收到的時間
      Then P95 (over 100 requests in production) < 3000ms
      And Worker log 的 durationMs < 2500 for P95
```

---

## AC-Group 8：已知邊界 / 向後相容（NFR-013）

```gherkin
Feature: 向後相容與邊界條件

  Rule: 舊 summary.json 無新欄位時不 crash

    Example: 前端遇到舊 JSON
      Given summary.json 的 RepoSummary 物件無 canSubmitIssue 欄位
      When OverviewPage 渲染
      Then 該 repo 自動歸入「僅供瀏覽」區塊
      And console 無錯誤

  Rule: IssueLite.type 為 null 時 UI 不顯示 type badge

    Example: 舊 issue
      Given issue 的 type === null
      When RoadmapPage 的 IssueList 渲染此 issue
      Then issue 項目不顯示 type badge
      And 其他欄位（title / labels / assignees）正常顯示
```

---

## 附錄：AC 編號與 FR / NFR 對照

| AC Group | 對應 FR / NFR |
|----------|---------------|
| 1（建立 Issue） | FR-001, FR-003, FR-005, FR-007, FR-008, FR-011 |
| 2（留言） | FR-002, FR-004, FR-005, FR-012 |
| 3（Turnstile / 錯誤處理） | FR-006, FR-014, FR-015 |
| 4（OverviewPage 分區） | FR-009, FR-010, NFR-013 |
| 5（資料契約） | FR-007, FR-008, FR-009 |
| 6（部署與安全） | NFR-002, NFR-003, NFR-009 |
| 7（效能 / 可用性） | NFR-001, NFR-007 |
| 8（向後相容） | NFR-013 |
