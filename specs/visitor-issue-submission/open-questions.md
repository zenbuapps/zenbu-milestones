---
version: 0.1.0
date: 2026-04-18
status: draft
purpose: 明確列出未決項目，禁止 spec 作者腦補
---

# Open Questions — Visitor Issue Submission

本檔案列出**訪談中未明確決定**、但 planner / implementer 階段**需要再決定**的項目。每個 OQ 標記：

- **觸發時機**：什麼時候必須處理
- **候選方案**：已想到的方案
- **建議**：AI 的建議（僅供參考，不取代人類決定）
- **影響**：不處理會怎樣

**原則**：spec 作者（本 agent）**不自行決定**這些項目，也不在其他 spec 檔中偷偷塞答案。

---

## OQ-001 — `canSubmitIssue` 的自訂開關機制

**觸發時機**：若 maintainer 希望某些「有 milestone 但不想接受訪客提交」的 repo，或「無 milestone 但想接受訪客回報」的 repo，需要手動覆蓋 V1 規則。

**V1 現況**：`canSubmitIssue = !isPrivate && milestoneCount > 0`，無法自訂。

**候選方案**：

| # | 方案 | 複雜度 |
|---|------|-------|
| A | 在 repo 根目錄放 `.github/zenbu-milestones.yml`，fetcher 讀該檔的 `submissions.enabled` 欄位 | 中 |
| B | 在 `zenbu-milestones` repo 的 `config/repos.yml` 維護 override map | 低（但 repo-wise 擴展性差）|
| C | 在 repo description 加 magic keyword（例 `[ZENBU_SUBMISSIONS:OFF]`） | 低（醜） |
| D | 維持 V1 規則，不支援自訂 | 零（但可能需求會回彈） |

**建議**：V1 先 D，V2 實作 A。

**影響**：若 V1 就有特殊 repo 需求，maintainer 只能在 org 層 disable Issues 或把 milestone 清空。

---

## OQ-002 — Worker 的 staging / preview 環境

**觸發時機**：實作階段的 CI 設計，PR reviewer 希望在 merge 前驗證 Worker 行為。

**V1 現況**：只有一個 production Worker。

**候選方案**：

| # | 方案 | 說明 |
|---|------|------|
| A | 單一 production Worker（V1 選項） | PR merge 到 master 才部署，本地 `wrangler dev` 測試 |
| B | `wrangler.toml` 加 `[env.preview]` + CI 偵測 `pull_request` event 部署到 `zenbu-milestones-worker-preview.*.workers.dev` | PR 可實戰測試 |
| C | 每個 PR 一個 preview Worker（`-pr-${{ github.event.number }}`）| Cloudflare Free 方案 Worker 數量有限，易達上限 |

**建議**：V1 A；若 bug 頻繁再升 B。

**影響**：若選 A，PR reviewer 只能看 code review，實戰驗證要 merge 後。

---

## OQ-003 — Issue Types 清單的產出者

**觸發時機**：實作 `public/data/issue-types.json` 時決定誰呼叫 `GET /orgs/{org}/issue-types`。

**現況**：`data-contract.md` 提議兩條路，未二選一：
- (A) Fetcher 呼叫，但 `ZENBU_ORG_READ_TOKEN` 要加 `admin:org` read scope
- (B) Worker 呼叫（用 write PAT），寫入 Cloudflare KV 或每次呼 GitHub（多一 round-trip）

**候選方案**：

| # | 方案 | Pros | Cons |
|---|------|------|------|
| A | **Fetcher 產出**（擴 read PAT scope 加 `admin:org`） | 簡單；單一事實來源；前端直接 fetch 靜態 JSON | Read PAT 權限擴大 |
| B | Worker 產出（fetch summary 式，Cache API TTL） | 不擴 read PAT 權限 | Worker code 複雜度 + ; 前端要多打一次 Worker API |
| C | Worker 啟動時 fetch 存到 Cache API，export endpoint 給前端用 | 折衷 | 複雜度中 |

**建議**：A。`admin:org` read 只是讀 org 設定（risk 低），不涉及寫權限。

**影響**：若選 A 不過關，回退 B 會增加前端 runtime dependency（連不到 Worker 就沒 type 選單）。

---

## OQ-004 — Worker 的 summary.json fetch 失敗時的 fallback

**觸發時機**：實作 `worker/src/lib/canSubmit.ts` 時。

**現況**：ADR-007 提議 fetch summary.json + Cache API (TTL 5 min)。未決定「若 summary.json 不可讀」時怎辦。

**候選方案**：

| # | 方案 | 行為 |
|---|------|------|
| A | 保守：拒絕所有寫入（回 REPO_NOT_ALLOWED） | 安全；但 GitHub Pages 小問題就讓整個寫入功能掛掉 |
| B | 放寬：若無 cache 也無 live data → 允許所有 repo（但仍擋 private：查 GitHub API） | 功能可用率高 |
| C | 退到 stale cache：cache 過期但保留最後一份，無新 data 就用舊的 | 中庸 |

**建議**：**A 作為 V1**（fail-closed 符合安全慣例）；V2 可升 C。

**影響**：若選 A，Pages 臨時不可用時寫入功能跟著掛；但資料不一致的風險較低。

---

## OQ-005 — Turnstile 服務宕機時的 fallback

**觸發時機**：實作 `worker/src/middleware/turnstile.ts` 時。

**現況**：ADR-002 的「Turnstile 服務宕機同時寫入失效」是 V1 可接受風險。未明確定義宕機偵測與 fallback。

**候選方案**：

| # | 方案 | 行為 |
|---|------|------|
| A | Turnstile siteverify 5xx → 一律拒絕（回 UPSTREAM_ERROR） | 保守 |
| B | siteverify timeout 2s → fallback 放行（僅限極短時間段）| 危險，不建議 |
| C | 監控 Cloudflare status，人工切換 feature flag | 需要額外觀測工具 |

**建議**：A。

**影響**：Turnstile 掛掉時寫入停擺，但讀取不受影響。

---

## OQ-006 — `MediaUploadHint` 是否可被使用者關閉

**觸發時機**：UI 實作階段收到 user feedback「提示每次都看，煩」。

**V1 現況**：`ui-spec.md` FR-013 規定不可關閉。

**候選方案**：

| # | 方案 | 成本 |
|---|------|------|
| A | V1 不可關閉 | 零 |
| B | 加 X 按鈕 + localStorage 記憶 | 低 |
| C | 首次出現、之後摺疊成 icon tooltip | 中 |

**建議**：V1 A；收到 feedback 再升 B。

**影響**：極端情況下一些老訪客會覺得煩，但資訊保證到位。

---

## OQ-007 — 樂觀更新的 `IssueLite` 欄位 fallback

**觸發時機**：實作 FR-012 時組 IssueLite 物件。

**現況**：`architecture.md` ADR-009 提到「以 Worker 回傳 + 表單值組合」，但 `IssueLite` 的某些欄位 Worker 不回：

- `closedAt` → `null`（新 issue 一定 open）
- `state` → `'open'`（同上）
- `assignees` → `[]`（訪客不能指派）
- `updatedAt` → `new Date().toISOString()`（近似值）

**問題**：`labels[].color` 需要 6 位 hex，Worker 只回 label names。V1 統一給 `'888888'` 是否影響 UI？

**候選方案**：

| # | 方案 | 說明 |
|---|------|------|
| A | 全部 label 用 `'888888'` | 樂觀 state 下 label 顯示為灰色；cron 重跑後才顯示真實色 |
| B | 前端維護一份 org-wide label color cache（fetcher 額外產出 `labels.json`）| 需要新資料線 |
| C | Worker 呼 GitHub 再回傳 full issue 物件 | 多一次 API call |

**建議**：A。使用者 1 小時後重整即看到正確色，短暫灰色不算問題。

**影響**：若選 A，Modal 關閉後展開 milestone，會看到新 issue 的 label 短暫是灰色。

---

## OQ-008 — 多工態 / 並行送出的處理

**觸發時機**：實作前端送出 logic 時。

**問題**：使用者快速點「送出」兩次 → 送兩次 request → 可能建兩個 issue。

**候選方案**：

| # | 方案 |
|---|------|
| A | 前端 `submitting` state 鎖住 button | 基本防護 |
| B | 加 UUID `Idempotency-Key` header，Worker 以 Cache API 去重 5 分鐘內同 key 的 request | 強一致性，但實作複雜 |
| C | A + 提交記錄到 `sessionStorage`，避免整頁重載後再送 | 中 |

**建議**：A（V1），B（V2）。

**影響**：若選 A，極端情況（使用者在 5 秒內兩次按送出、第一次還沒 response）可能建兩個 issue。

---

## OQ-009 — Rate limit 的精確策略

**觸發時機**：Worker 實作 `RATE_LIMITED` 錯誤時。

**現況**：FR-015 定義了 RATE_LIMITED code，但沒定 Worker 自己的 rate limit（除了 GitHub 上游的 429）。

**候選方案**：

| # | 方案 | 成本 |
|---|------|------|
| A | 不做 Worker 端 rate limit，只 forward GitHub 的 429 | 零 |
| B | 每個 IP 每分鐘最多 X 次（cloudflare KV / Turnstile 自動） | 中 |
| C | Cloudflare Rate Limiting Rules（Zone 級） | Zone plan 需求 |

**建議**：A + Turnstile 天然的 bot 防護。V2 觀察 log 後再決定 X。

**影響**：若選 A，某個惡意 IP 可能耗盡 GitHub 的 rate quota → 波及 Fetcher 的讀取（但 Fetcher 用不同 PAT，各 PAT 配額獨立，影響小）。

---

## OQ-010 — Worker log 的保留與分析

**觸發時機**：NFR-012 可觀測性實作。

**現況**：Worker 用 `console.log` 輸出結構化 JSON，Cloudflare Dashboard 即時查看。

**候選方案**：

| # | 方案 | 成本 |
|---|------|------|
| A | 只用 Dashboard real-time logs（無歷史） | 零 |
| B | Logpush 到 R2 / S3 / Datadog | 需訂閱 / Workers Paid 方案 |
| C | Worker Analytics Engine（即將 GA） | 中 |

**建議**：V1 A。若需長期分析再升。

**影響**：V1 debug 只能看即時 log，不能事後回溯。

---

## OQ-011 — Incident Response 預案

**觸發時機**：投產前。

**情境清單**：

1. **大量 spam issue 湧入**（Turnstile 被繞過 / 設定錯誤）
   - 應對：臨時關閉 Worker（Cloudflare Dashboard disable route）
2. **有人透過 Worker 寫入惡意內容**（XSS payload / 鏈接）
   - 應對：Worker 加 sanitizer（V2）；V1 靠 GitHub 原生 Markdown render 的安全性
3. **PAT 洩漏**
   - 應對：見 `deployment.md` 場景 E
4. **Cloudflare 全面宕機**
   - 應對：前端降級顯示「目前無法提交，請直接到 GitHub」

**建議**：planner 階段建立 `docs/incident-response.md`（或放 `.claude/runbook/` 類似的位置），明列各情境的第一反應 SOP。

**影響**：若無預案，發生時臨時反應容易失準。

---

## OQ-012 — V2 規劃：Bunny CDN 升級

**觸發時機**：靜態資料量或流量超過 GitHub Pages 免費額度時。

**現況**：使用 GitHub Pages，未達上限。

**候選方案**：

| # | 方案 | 時機 |
|---|------|------|
| A | 維持 GitHub Pages | V1 OK |
| B | 遷移到 Bunny CDN（user 曾提及） | 流量超 100GB / 月，或需 custom domain 彈性 |
| C | Cloudflare Pages（與 Worker 同生態） | 簡化部署 |

**建議**：V1 A；V2 觀察流量數據再決定 B 或 C。

**影響**：若擇一錯誤，遷移時會有短暫停機 + 路徑變更。

---

## OQ-013 — V2 規劃：提交配額管理

**觸發時機**：V1 投產後，觀察到異常提交行為。

**候選方案**：

| # | 方案 |
|---|------|
| A | Per-IP daily quota（Cloudflare KV）|
| B | Per-repo daily quota |
| C | 全站 daily quota（保護 GitHub PAT rate limit）|
| D | 動態：根據 issue open 數量自動調整 |

**建議**：V2 至少做 A + C。

**影響**：V1 不做 → 極端情況可能用光 GitHub PAT quota。

---

## OQ-014 — V2 規劃：IP reputation 與地理封鎖

**觸發時機**：觀察到特定來源持續濫用。

**候選方案**：依賴 Cloudflare Bot Management / Access Rules。

**建議**：V2 考慮。V1 靠 Turnstile 已能擋多數機器人。

---

## OQ-015 — PAT 輪替自動化

**觸發時機**：V1 投產後，PAT 過期前一週。

**候選方案**：

| # | 方案 |
|---|------|
| A | 純人工（見 `deployment.md` Runbook） |
| B | 建 GitHub App（較複雜但免人工 rotate） |
| C | Scheduled GitHub Actions workflow 每 80 天提示 reviewer（不自動 rotate，人工執行）|

**建議**：V1 A；V2 建 App。

**影響**：PAT 過期沒人記得換 → 寫入 / 讀取任一功能停擺。

---

## OQ-016 — 本 spec 是否需要額外產生 `.feature` / `.activity`

**觸發時機**：planner 決定 aibdd workflow 時。

**現況**：本次訪談由 clarifier 產出 9 個 `.md` spec 文件，**未產出** Gherkin `.feature` 或 Activity diagram。

**說明**：
- 用戶的交付物清單只要求 `.md` 文件（`README.md` / `requirements.md` / `user-stories.md` / `acceptance-criteria.md` / 等）
- `acceptance-criteria.md` 已用 Gherkin 格式呈現驗收標準，可直接被 test-creator 使用
- 若 planner 希望走完整 aibdd 流程（`/aibdd-form-activity` + `/aibdd-form-feature-spec` + `/aibdd-form-entity-spec` + `/aibdd-form-api-spec`）：需額外執行對應 skill

**建議**：交由 team-lead / planner 決定。若決定走 aibdd 流程，本 9 份 spec 可作為輸入素材餵給對應 skill。

---

## OQ 狀態追蹤表

| OQ | 緊急程度 | 決定時機 |
|----|---------|---------|
| OQ-001 | 低 | V2 |
| OQ-002 | 中 | 實作 CI 階段 |
| OQ-003 | 高 | 實作 fetcher 前 |
| OQ-004 | 高 | 實作 Worker canSubmit 前 |
| OQ-005 | 中 | 實作 Turnstile middleware 前 |
| OQ-006 | 低 | V2 |
| OQ-007 | 中 | 實作前端樂觀更新前 |
| OQ-008 | 中 | 實作前端送出 logic 前 |
| OQ-009 | 低 | V2 或觀察 log 後 |
| OQ-010 | 低 | V2 |
| OQ-011 | 高 | 投產前 |
| OQ-012 | 低 | V2 |
| OQ-013 | 低 | V2 |
| OQ-014 | 低 | V2 |
| OQ-015 | 中 | 投產後 80 天內 |
| OQ-016 | 立即 | planner 階段決定 |
