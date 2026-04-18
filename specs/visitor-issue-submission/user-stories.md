---
version: 0.1.0
date: 2026-04-18
status: draft
---

# User Stories — Visitor Issue Submission

以使用者故事（User Story）格式紀錄各 persona 的意圖與期望成果。每一條對應 `requirements.md` 的一或多個 FR / NFR，及 `acceptance-criteria.md` 的一或多組 Given/When/Then。

故事格式：

> **作為** `<角色>`，**我想要** `<行動>`，**以便** `<價值>`。

---

## Persona：訪客（Visitor）

匿名瀏覽 Zenbu Milestones Dashboard 的使用者，通常是對 zenbuapps 產品感興趣的外部開發者、潛在客戶，或正在評估是否貢獻開源的人。

### US-V-001 — 在 RoadmapPage 建立 bug 回報

> **作為** 訪客，**我想要** 在某個 repo 的 RoadmapPage 上一鍵開啟建立 issue 的 Modal，**以便** 直接回報我遇到的 bug，不用跳轉到 GitHub 再登入。

**成功 signal**：
- RoadmapPage 右上角「建立 issue」按鈕清楚可見（僅在 `canSubmitIssue=true` 時）
- 點擊 → Modal 在 < 200ms 開啟
- 填 title（含 bug 描述）+ body（Markdown，含重現步驟）+ 選 type=Bug → 送出 → 3 秒內看到成功 Toast + GitHub issue URL

**關聯**：FR-001 / FR-003 / FR-008 / FR-011

---

### US-V-002 — 在留言 Modal 補充既有 issue 資訊

> **作為** 訪客，**我想要** 對我讀到的某個 open issue 留言補充資訊（例如「我也遇到這個問題，環境是 macOS 14.5」），**以便** 讓 maintainer 更容易診斷。

**成功 signal**：
- 點 IssueList 裡的 issue → 展開 → 「留言」按鈕
- Modal 只有 body 欄位（沒有 title / type，避免混淆）
- 送出成功後 Toast + 連結到該留言的 GitHub 錨點

**關聯**：FR-002 / FR-004 / FR-012

---

### US-V-003 — 理解為什麼不能直接上傳截圖

> **作為** 訪客，**我想要** 在 Markdown 編輯器旁看到清楚的提示說「為什麼不能貼圖、我該怎麼做」，**以便** 我不會困惑而放棄填寫。

**成功 signal**：
- Modal 打開時，編輯器下方固定顯示提示區塊（`--color-surface-overlay` 底色）
- 文字包含：「目前暫不支援圖片 / 影片上傳」+ 三個外部選項（imgur / YouTube / GitHub Gist）
- 提示無法被關閉（避免錯過），但視覺上不搶走主編輯器焦點

**關聯**：FR-013

---

### US-V-004 — 送出後看到即時結果

> **作為** 訪客，**我想要** 送出 issue 後立刻在儀表板上看到它出現，**以便** 確認送出真的成功而不是以為丟了。

**成功 signal**：
- Toast 內含 GitHub 新 issue 的 URL（可點擊外連驗證）
- RoadmapPage 的 milestone 展開清單**立即**出現這個新 issue（樂觀更新）
- 重新整理頁面後，1 小時內可能再次出現（等 cron 跑過）或消失（樂觀更新 state loss），兩種情況都不應困擾使用者

**關聯**：FR-012、NFR-001

---

### US-V-005 — 在手機上流暢使用 Modal

> **作為** 訪客（在手機上瀏覽），**我想要** Modal 能全螢幕或接近全螢幕展開，**以便** 在小螢幕上也能舒適填寫 Markdown。

**成功 signal**：
- Modal 在 < 640px 裝置上幾乎佔滿 viewport（留 px 邊距）
- Markdown 編輯器的工具列可橫向捲動，不疊到預覽區
- Turnstile widget 正常顯示，不被遮擋

**關聯**：FR-001、NFR-006、`ui-spec.md`

---

### US-V-006 — 被 Turnstile 擋下時不要重填整個表單

> **作為** 訪客，**我想要** 如果 Turnstile 驗證失敗，可以在 Modal 內看到錯誤訊息並重試，而不是整個 Modal 消失、表單資料遺失。

**成功 signal**：
- Turnstile token 驗證失敗時，Modal 不關閉
- 錯誤訊息 inline 顯示（紅字 + `AlertCircle` 圖示），位置靠近送出按鈕
- 使用者點「重新驗證」→ Turnstile widget reset → 可再試
- 表單欄位內容保留不變

**關聯**：FR-006、FR-015 `TURNSTILE_FAILED`

---

### US-V-007 — 從 OverviewPage 快速找到可提交的 repo

> **作為** 訪客，**我想要** OverviewPage 清楚區分「哪些 repo 我可以提交 issue / 哪些只能看」，**以便** 我不會點進一個 private repo 卻發現沒有按鈕而困惑。

**成功 signal**：
- OverviewPage 分兩區：「接受訪客提交」（醒目）+「僅供瀏覽」（折疊，預設收合）
- 「接受訪客提交」區的 RepoCard 內有明顯「可在此建立 issue」的提示（圖示或 badge）
- 點「僅供瀏覽」區的 repo 外連到 GitHub，不進入 SPA 的 RoadmapPage

**關聯**：FR-010、FR-009

---

## Persona：Maintainer（`zenbuapps` org 成員）

負責審閱訪客提交、分流到對應 milestone / team member 的人。通常透過 GitHub 原生 UI 工作，不會進 Zenbu Milestones 管理後台（V1 沒有後台）。

### US-M-001 — 一眼看出哪些 issue 是訪客匿名提交

> **作為** maintainer，**我想要** 每個訪客建立的 issue 都自動帶 `待審核` label，**以便** 我可以用 GitHub 的 filter 快速找到待分流的 issue。

**成功 signal**：
- GitHub issue list 搜尋 `label:待審核` 能找到所有訪客提交
- maintainer 處理後移除此 label，交由其他 label 管理後續流程
- Issue body 內的「舉報聯絡方式」template（選填）給 maintainer 一個回覆管道

**關聯**：FR-007、Q15、Q16

---

### US-M-002 — Issue Types 分類一次到位

> **作為** maintainer，**我想要** 訪客在提交時就能選對分類（Bug / Feature / Task），**以便** 我不需要額外花時間 label 標記。

**成功 signal**：
- Modal 內的 type 下拉選單值域直接用 org-level Issue Types（Bug / Feature / Task 等）
- 建立的 issue 在 GitHub UI 上直接顯示對應 Issue Type 標記
- 若訪客未選 type（或 org 尚未啟用 Issue Types），maintainer 仍可用傳統 label 補救

**關聯**：FR-008

---

### US-M-003 — 濫用來源的阻隔

> **作為** maintainer，**我想要** Turnstile 能擋掉機器人大量提交，**以便** 我不需要人工刪除 spam issue。

**成功 signal**：
- Cloudflare Dashboard 能看到 Turnstile challenge 的通過 / 失敗比例
- Worker log 能追蹤單一 Origin 的異常頻率（NFR-012）
- V2 可擴充至「IP reputation / 速率限制」（列入 `open-questions.md`）

**關聯**：FR-006、NFR-012

---

### US-M-004 — 敏感 repo 不暴露提交入口

> **作為** maintainer（同時也管 private repo），**我想要** 訪客看不到 private repo 的建立 issue 入口，**以便** 避免外部有人意外透過 proxy 嘗試寫入。

**成功 signal**：
- OverviewPage / RoadmapPage 上 private repo 不會顯示「建立 issue」按鈕
- 即使有人手工 POST 到 Worker 的 `/api/v1/issues`（帶 private repo 名），Worker 回 `REPO_NOT_ALLOWED` 403

**關聯**：FR-009、FR-015、NFR-009

---

## Persona：CI（GitHub Actions）

無人值守的 cron job，每小時同步資料 + 部署前端 & Worker。

### US-CI-001 — 訪客新建的 issue 會在下一小時被同步

> **作為** CI（cron 每小時跑），**我需要** `scripts/fetch-data.ts` 抓回新建的 issue，**以便** 靜態 JSON 反映真實狀態，樂觀更新不再是唯一可信來源。

**成功 signal**：
- 新建 issue 後 1 小時內，`public/data/repos/{name}.json` 含該 issue
- `public/data/summary.json` 的 totals 與 `nextDueMilestone` 對應更新
- 無任何 fetcher 錯誤（因為訪客 issue 走 GitHub 原生管道，與 PR 類型排除、敏感 label 過濾無衝突）

**關聯**：既有 `specs/data-pipeline.md`（不變）

---

### US-CI-002 — 單次 push 同時部署前端與 Worker

> **作為** CI（push 到 master），**我需要** 一次 workflow run 內同時：
> 1. 跑 fetcher 產 public/data
> 2. 建前端 bundle 部署到 GitHub Pages
> 3. 部署 Worker 到 Cloudflare
>
> **以便** 前後端 release 同步（避免前端期待新 Worker API 但 Worker 還是舊版）。

**成功 signal**：
- 一個 workflow run 包含兩個 job：`deploy-pages`（現有）+ `deploy-worker`（新）
- Worker deploy 失敗時 Pages deploy 也應 block（透過 job dependency 或 conditional）
- 詳細 CI 結構見 `deployment.md`

**關聯**：`deployment.md`

---

## Persona：Cloudflare Worker

Zenbuapps 自建的邊緣執行環境，作為唯一寫入通道。

### US-W-001 — 驗證來源、代發請求、回傳結果

> **作為** Worker，**我需要** 對每個 request 做以下事：
> 1. 檢 Origin 白名單（否則 403 CORS_REJECTED）
> 2. 檢 Turnstile token（否則 403 TURNSTILE_FAILED）
> 3. 檢 payload schema（否則 400 INVALID_PAYLOAD）
> 4. 檢 target repo 的 canSubmitIssue（否則 403 REPO_NOT_ALLOWED）
> 5. 呼叫 GitHub API（上游錯誤 → 502 UPSTREAM_ERROR）
> 6. 回傳結果（envelope 見 FR-015 / FR-016）
>
> **以便** 前端只負責 UI，所有安全性檢查收斂在 Worker。

**關聯**：FR-005 / FR-006 / FR-007 / FR-008 / FR-015 / FR-016

---

### US-W-002 — Worker 的 `canSubmitIssue` 檢查來源

> **作為** Worker，**我需要** 一份「可提交 repo 清單」來決定是否允許該 request，**以便** 即使前端被繞過，後端仍能擋住 private repo / 無 milestone repo 的請求。

**兩種方案**（見 `open-questions.md` 的 OQ-004）：
- (A) Worker 於 cold start 時 fetch `https://zenbuapps.github.io/zenbu-milestones/data/summary.json` 讀 canSubmitIssue（有 cache staleness 問題）
- (B) Worker 維護一份硬編碼白名單（維運摩擦）
- (C) Worker 直接呼叫 GitHub API 檢查 repo 屬性（多一次 round-trip）

V1 選 (A)，cache 5 分鐘（於 `architecture.md` ADR-007 記錄）。

**關聯**：FR-005、FR-009

---

## 跨 persona 的非故事期望

以下項目不在任何 persona 的故事中明確表達，但由 NFR 保證：

- 前端 bundle 不含 PAT / Secret（NFR-002 / NFR-003）
- Markdown 編輯器 lazy load（NFR-007）
- 所有 UI 文案 zh-Hant（NFR-010）
- Worker log 結構化（NFR-012）
