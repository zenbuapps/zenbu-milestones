# 提示詞：讓訪客透過 Zenbu Milestones 提交 GitHub Issue（V1）

> **給 planner 的指示**：這份需求會讓 `zenbu-milestones` 專案從**純靜態儀表板**翻轉為**前後分離 + DB 的應用**。舊版 `specs/visitor-issue-submission/plan.md`（Cloudflare Worker + Turnstile 匿名投稿方案）作廢，請不要沿用其架構。
> 本文件用「已作廢：X」標示被推翻的原需求，請 planner 不要照舊實作；用「Open Question」標示需要在 plan 階段決策或回頭問用戶的點。

---

## 一、目標與範圍

### 一句話需求
讓使用者以 Google 帳號登入 `zenbu-milestones` 網站後，可對 `zenbuapps` 組織下**任一公開 repo** 提交 issue 草稿，草稿進入後端 DB 待管理員審核，審核通過後才由後端代為轉送成真的 GitHub issue。

### 架構翻轉（重要）
- **原架構**（現況 + 舊 plan）：純靜態 SPA、build-time fetch、無後端、無 DB
- **新架構**（本需求）：前後分離
  - **前端**：現有 Vite + React 18 + TS（保留）
  - **後端**：NestJS + DB（新建）
  - **既有 build-time fetcher（`scripts/fetch-data.ts`）**：**保留**，繼續作為公開唯讀資料快取。NestJS 只處理「寫入 + 審核 + user 資料 + 代理 GitHub 寫入」

### V1 範圍
- Google OAuth 登入
- 所有 `zenbuapps` 非 archived、非 private 的 repo 都可提交 issue（不再限制「有 milestone」）
- 每個 repo roadmap 頁：提交 issue 按鈕 + repo 的 issue 列表（含搜尋 / filter）
- Issue 草稿 → DB（status = pending）→ 管理員審核 → 通過後由後端代呼 GitHub API 轉送
- 使用者個人選單：「我的 issue 管理」頁，可看自己發過的 issue 與各自狀態
- 支援 Markdown 編輯器（盡量貼近 GitHub 體驗）
- 圖片附件上傳（V1 做到哪請 planner 評估，見第七節）

### V2 延後
- 影片附件（若 V1 無法透過 GitHub user-attachments 支援，則走 Bunny CDN，planner 可選擇推遲到 V2）
- 管理員後台完整 UI（V1 可以先做最小可行審核介面，或用 DB 直改 + script，planner 決定）
- Email / in-app 通知（審核通過 / 拒絕時通知提交者）

---

## 二、角色

| 角色 | 登入方式 | 可做什麼 |
|---|---|---|
| **訪客（未登入）** | — | 瀏覽 Overview / Roadmap / Issue 列表（唯讀），**不能提交 issue** |
| **登入使用者** | Google OAuth | 提交 issue 草稿、查看自己的 issue 管理頁 |
| **管理員** | Google OAuth + role 標記 | 審核 pending issue、通過後觸發後端代轉 GitHub、**指派其他使用者為管理員**、**控制哪些 repo 可在 UI 上接受投稿** |

### 2.1 管理員晉升機制（V1 必做）

- 現任管理員可在 admin 介面「指派 / 撤銷」其他使用者的 admin role
- 後端對應 API：`PATCH /api/admin/users/:id/role`，body `{ role: 'admin' | 'user' }`，僅 admin 可呼叫
- 所有 role 變更要寫稽核 log（誰在何時把誰改成什麼 role），寫入 DB `audit_logs` 或類似表
- **初始管理員**（bootstrap）：以後端環境變數 `INITIAL_ADMIN_EMAILS`（逗號分隔）定義，首次登入時自動寫 role = admin；之後增刪走 UI
- **安全欄位**：不允許使用者改自己的 role（後端檢查 `req.user.id !== targetUserId`）；最後一位 admin 不可被撤銷（防誤操作鎖死系統）

**Open Question 2-1**：初始管理員 bootstrap 以 `INITIAL_ADMIN_EMAILS` env var 為準；撤銷最後一位 admin 的邏輯要不要做例外放行（例：超級 root account）？planner 決策。

---

## 三、已作廢的原需求（planner 請勿實作）

以下是原始提示詞中被下半段需求推翻的項目，**一律不做**：

- ~~已作廢：訪客（未登入）可以直接提交 issue~~ → 改為必須 Google 登入
- ~~已作廢：在 localStorage 記錄訪客姓名 / Email / Line ID，下次免填~~ → 改為 Google profile 自動帶出，存後端 DB `users` 表
- ~~已作廢：「Issue 提出者資料」區塊（姓名* / Email / Line ID）的表單欄位~~ → 改為後端從登入 session 自動取用 user id；前端表單不需要讓使用者填個人資料
- ~~已作廢：使用者發表後「即時打 GitHub API + 自動掛 `待審核` label」~~ → 改為先寫 DB（狀態 = pending），審核通過後才由後端代呼 GitHub API 轉送
- ~~已作廢：「`待審核`」以 GitHub label 形式存在於 GitHub issue 上~~ → 在 V1，`待審核` 改為 DB 的 status 欄位；是否在轉送到 GitHub 時額外加來源 label，見 Open Question 5-1
- ~~已作廢：舊版 plan 中的 Cloudflare Worker + Turnstile 匿名投稿方案~~ → 以新的 NestJS + Google OAuth 取代
- ~~已作廢：列出所有 repo 時僅限「有 milestone 的 repo」~~ → 改為所有 `zenbuapps` 非 archived、非 private 的 repo 都列出且可投稿

**保留沿用自原需求**：
- Issue 列表 UI（repo 當前 issues）＋ 搜尋 / filter（參考 GitHub issues filter）
- Markdown 編輯器盡量貼近 GitHub 體驗
- 不支援使用者指派 milestone / 標籤 label（提交者不可自選 label）
- 列出所有 `zenbuapps` org 的 repo 供選擇投稿

---

## 四、功能需求（V1）

### 4.1 登入與身份

- Google OAuth 登入（OAuth 2.0 / OpenID Connect）
- 登入後後端建立 / 更新 DB `users` 表：`id`, `googleSub`, `email`, `displayName`, `avatarUrl`, `role`(`user` | `admin`), `createdAt`, `updatedAt`
- 前端登入狀態以 session cookie 或短期 JWT 管理（planner 依 NestJS 慣例選擇並在 plan.md 記錄）
- 登出

### 4.2 提交 Issue（Roadmap 頁 / Repo 頁）

- 每個 repo 的頁面上新增「提出 issue」按鈕
- 按鈕點擊後顯示編輯表單：**呼叫 `/zenbuapps-design-system` SKILL 評估採用 Modal 或 Drawer**，在 plan.md 中記錄決策
- 表單欄位：
  - **標題**（必填，純文字，≤ 256 字元）
  - **內容**（必填，Markdown，支援預覽；盡量與 GitHub 同款，可參考 BlockNote / @uiw/react-md-editor / MDXEditor，由 planner 調查後推薦）
  - **附件**（選填，多檔）— 見第七節
- 送出流程：
  1. 前端 POST 到 NestJS API `/api/issues`（附當前 repo 識別：`owner/name`）
  2. 後端驗證登入狀態、寫入 DB `issues` 表（`status = pending`）
  3. 回傳成功訊息，前端關閉表單並在 issue 列表顯示「您提交的草稿已送出，待審核中」

### 4.3 Repo Issue 列表

位置：每個 repo 的 roadmap 頁。顯示內容：

- **主要來源**：GitHub 上該 repo 的 issues（透過現有 `scripts/fetch-data.ts` 擴充，或由後端 runtime fetch，planner 決定，見 Open Question 6-1）
- **使用者本人的 pending / rejected 草稿**：僅提交者本人可見；不公開

**Open Question 4-3-1**：repo issue 列表對非登入訪客是否顯示？傾向：顯示已同步到 GitHub 的 issue（公開），pending 草稿僅作者可見。請 planner 確認。

**搜尋 / filter 能力**（V1 必備，參考 GitHub issues UI）：
- 依狀態過濾：`open` / `closed` / `all`
- 依 label 過濾
- 依 milestone 過濾
- 依 assignee 過濾（若資料有）
- 關鍵字搜尋（標題 + body）

### 4.4 我的 Issue 管理頁

- 路徑：`/me/issues`（或 HashRouter 下的對應 hash path）
- 顯示當前登入使用者提交過的所有 issue 草稿 + 已轉送的 GitHub issue
- 欄位：標題、所屬 repo、狀態（`pending` / `approved` / `rejected` / `synced-to-github`）、審核備註（若 rejected）、建立時間、對應 GitHub issue 連結（若已同步）

### 4.5 管理員後台（V1 最小可行）

管理員介面包含三個分頁：

1. **Issue 審核**
   - 列出所有 `pending` issue
   - 每筆可：**通過**（觸發後端代呼 GitHub API 建 issue；成功後寫回 `githubIssueNumber` 並把 status 改為 `synced-to-github`）/ **拒絕**（寫入拒絕原因，status 改為 `rejected`）
   - 轉送到 GitHub 時，後端使用**一個中央 PAT**（見第六節）呼叫 `POST /repos/{owner}/{repo}/issues`

2. **Repo 投稿設定**（見 4.6）
   - 列出所有 repo，逐筆切換 `visibleOnUI` / `canSubmitIssue`

3. **使用者權限管理**（見 2.1）
   - 列出所有使用者，可指派 / 撤銷 admin role
   - 顯示稽核 log（最近 N 筆 role 變更紀錄）

**Open Question 4-5-1**：V1 的管理員介面做到多完整？候選：
- A｜最小：僅 API endpoint + 簡易 HTML table（套用既有 design system）
- B｜中等：專屬 `/admin` 頁，三個分頁 + 基本操作
- C｜最小化到極致：先不做 UI，管理員直接改 DB + 跑 script 觸發轉送

建議 **B**（既然已經有三個功能要管，API-only 無法操作太難用）。

### 4.6 列出所有 repo + 管理員控制投稿可見性

#### 顯示層（所有使用者都看得到）
- Overview 頁 / Sidebar：列出 `zenbuapps` org **所有** repo（不再限制「有 milestone」；是否過濾 archived / private 見下）
- 更新 `scripts/fetch-data.ts` 的過濾邏輯

#### 投稿控制層（V1 必做，管理員獨有）
- 每個 repo 在 DB 有對應紀錄（`repo_settings` 表，見第八節），欄位 `canSubmitIssue: boolean`（預設 `true`）、`visibleOnUI: boolean`（預設 `true`）
- **管理員可在 admin 介面逐個 repo 切換**：
  - 「是否顯示在 UI 上」（false 時前端完全不列此 repo）
  - 「是否允許投稿」（true 才顯示提交按鈕；false 時 repo 仍在列表但投稿按鈕隱藏 / disabled）
- 後端 API：`PATCH /api/admin/repos/:owner/:name/settings`，body `{ canSubmitIssue?, visibleOnUI? }`，僅 admin 可呼叫
- 使用者端打 `POST /api/issues` 時，後端必須再檢查目標 repo 的 `canSubmitIssue` 為 true，否則回 403（防繞過前端）

**Open Question 4-6-1**：archived / private repo 預設怎麼處理？建議：archived → `visibleOnUI = false` 預設；private → 不納入 DB（fetcher 本來就不抓）。planner 確認。

**Open Question 4-6-2**：新 repo 第一次被 fetcher 發現時，DB `repo_settings` 該如何初始化？建議：fetcher 每輪跑完後 upsert 一筆 `{ canSubmitIssue: true, visibleOnUI: true }`（若不存在才 insert）。planner 決策。

---

## 五、流程（happy path）

1. 使用者以 Google 帳號登入 `zenbu-milestones`
2. 瀏覽 `zenbuapps/wp-power-course` 的 roadmap 頁，點「提出 issue」
3. 填寫標題 + Markdown 內容（可選附件），送出
4. 後端 `POST /api/issues` → 寫入 DB（status = pending）
5. 使用者在「我的 issue 管理」頁看到該 issue，狀態 `pending`
6. 管理員登入後在 `/admin`（或對應介面）看到該 pending，點「通過」
7. 後端以中央 PAT 呼叫 GitHub API 建立 issue，更新 DB（status = `synced-to-github`，附 `githubIssueNumber`、`githubIssueUrl`）
8. 下一輪 fetcher 跑完後（或 NestJS 的 runtime fetch），repo issue 列表會看到這筆 issue 真的出現在 GitHub 上

---

## 六、技術棧與部署

### 技術棧
- **前端**：Vite + React 18 + TypeScript（沿用現有專案），HashRouter（沿用，GitHub Pages 限制）
- **後端**：NestJS（新建）
- **DB**：**Open Question 6-1**，候選：PostgreSQL（推薦，成熟、Prisma/TypeORM 支援佳）/ MySQL / SQLite（簡單但 scale 受限）
- **ORM**：Prisma 或 TypeORM（planner 挑一個並說理由）
- **Auth**：Google OAuth 2.0 + NestJS `passport-google-oauth20`（或同等），session / JWT 二選一

### 專案結構
**Open Question 6-2**：既有前端專案（單 repo）+ 新 NestJS 後端，結構候選：
- A｜Monorepo（pnpm workspaces，前端 + 後端同一 repo）— 推薦，方便共用型別
- B｜另開後端 repo（例：`zenbu-milestones-api`）— 邊界清楚但型別要複製
- C｜NestJS 後端放在當前 repo 的 `server/` 子目錄，調整 CI

### 部署位置
**Open Question 6-3**：
- 前端：可否繼續 GitHub Pages？（靜態站應該可以，但要 CORS 設定讓前端呼叫後端）
- 後端：Railway / Render / Fly.io / Cloudflare Containers / 自架？請 planner 列出候選 + 推薦
- DB：若走 PostgreSQL，要 managed（Neon / Supabase / Railway PG）還是自架？

### 既有 fetcher 的角色
**保留** `scripts/fetch-data.ts`，繼續每小時把公開 repo 資料拉成靜態 JSON 給前端讀（唯讀路徑零成本）。NestJS 只處理：
- 使用者寫入操作（提交 issue 草稿）
- 使用者身份（OAuth、session）
- 管理員審核 + 代呼 GitHub 寫入
- 「我的 issue 管理」頁的查詢（讀 DB，不讀 GitHub）

**Open Question 6-4**：repo issue 列表資料來源——是走既有 fetcher 的 JSON，還是改由 NestJS runtime 從 GitHub 抓？傾向沿用 fetcher（減少 runtime 對 GitHub 的打擊），planner 可提建議。

### GitHub PAT 權限
**需要重新簽發**一組後端專用 PAT，**和現有 `ZENBU_ORG_READ_TOKEN` 分開**：

- 現有 `ZENBU_ORG_READ_TOKEN`（CI fetcher 用）：**保留**為 read-only（contents / issues / metadata）
- 新 token（NestJS 後端用）：fine-grained PAT，對 `zenbuapps` 組織：
  - Contents: Read
  - **Issues: Read & Write**（要能代建 issue）
  - Metadata: Read
- 儲存：後端部署環境的 env var（例：`ZENBU_ORG_WRITE_TOKEN`）；**絕不上 GitHub Actions secrets 以外的地方**
- 過期處理：90 天輪替，到期前 Actions schedule 通知

---

## 七、附件上傳策略

### V1 建議分層
- **圖片**：優先用 GitHub issue 原生 user-attachments（若 API 可支援；需研究 `POST /repos/{owner}/{repo}/issues` body 是否接受含 user-attachments URL 的 markdown）
  - **Open Question 7-1**：GitHub REST API 目前不直接支援「以 API 上傳 issue 附件」，只能用 web UI 拖拉。可行替代：
    - A｜後端先把圖片上到自家儲存（S3 / Cloudflare R2 / Bunny），把 URL 嵌入 Markdown body
    - B｜用 Bunny CDN 存所有附件（見下）
    - C｜Gist 附加法（hack，不推薦）
    - 請 planner 先做 spike 調查並在 plan.md 寫結論
- **影片**：檔案太大，走 Bunny CDN（V2 或 V1 末段視時程決定）

### Bunny CDN 設定（已提供）

**所有敏感值一律由後端 `.env` / 部署平台環境變數注入，前端不得接觸**：

```env
# 後端 .env（本地開發）；正式環境走 Railway/Render/Fly.io 的環境變數管理器
BUNNY_CDN_URL=https://git-action.b-cdn.net
BUNNY_STORAGE_HOST=sg.storage.bunnycdn.com
BUNNY_STORAGE_ZONE=git-action
BUNNY_STORAGE_PASSWORD=<此值已洩漏，請先 rotate 再填入新值>
```

- `.env` 檔**不得** commit 進 git（加入 `.gitignore`）
- repo 僅 commit `.env.example`，只放 key 名不放值
- GitHub Actions 需要用到時才放 Actions secret；但 V1 多數情境只在後端 runtime 使用，連 Actions 都用不到
- 前端需要用到附件 URL 時，**由後端簽發**（例：回傳已上傳的 Bunny CDN 公開 URL），前端絕不持有 `BUNNY_STORAGE_PASSWORD`

### 後端 secret 注入清單（V1）

| 變數 | 用途 | 注入方式 |
|------|------|----------|
| `DATABASE_URL` | DB 連線字串 | 部署平台 env var |
| `GOOGLE_OAUTH_CLIENT_ID` | OAuth 2.0 | 部署平台 env var |
| `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth 2.0 | 部署平台 env var |
| `SESSION_SECRET` / `JWT_SECRET` | session / JWT 簽章 | 部署平台 env var（強隨機 ≥ 32 byte） |
| `ZENBU_ORG_WRITE_TOKEN` | 後端代呼 GitHub API | 部署平台 env var |
| `BUNNY_STORAGE_PASSWORD` | 附件上傳 | 部署平台 env var |
| `BUNNY_CDN_URL` / `BUNNY_STORAGE_HOST` / `BUNNY_STORAGE_ZONE` | Bunny 設定（非秘密但分開管理） | 部署平台 env var |
| `INITIAL_ADMIN_EMAILS` | 首次登入自動授 admin 的 email 清單 | 部署平台 env var |

### 安全警告（極重要）
**`BUNNY_STORAGE_PASSWORD` 已被使用者在需求描述中貼為明文，視為已洩漏**。planner 必須在 plan.md 的「前置作業」章節加入以下 action item：
1. 登入 Bunny 控制台立刻 **rotate `BUNNY_STORAGE_PASSWORD`**
2. 新值只以後端 **`.env` / 部署平台環境變數** 形式注入，**禁止寫在任何文件 / commit / issue**
3. 檢查 git 歷史 / issue / PR / Slack 是否有其他地方殘留這組密碼，若有一併清掉
4. `.env.example` / README 只放 key 名，不放值

---

## 八、資料模型（草案，供 planner 參考）

```
users
  id                 uuid pk
  googleSub          string unique
  email              string unique
  displayName        string
  avatarUrl          string nullable
  role               enum('user', 'admin') default 'user'
  createdAt          timestamp
  updatedAt          timestamp

issues
  id                 uuid pk
  authorId           uuid fk -> users.id
  repoOwner          string    -- e.g. 'zenbuapps'
  repoName           string    -- e.g. 'wp-power-course'
  title              string
  bodyMarkdown       text
  status             enum('pending', 'approved', 'rejected', 'synced-to-github')
  githubIssueNumber  int nullable
  githubIssueUrl     string nullable
  reviewedBy         uuid fk -> users.id nullable
  reviewedAt         timestamp nullable
  rejectReason       text nullable
  createdAt          timestamp
  updatedAt          timestamp

issue_attachments
  id                 uuid pk
  issueId            uuid fk -> issues.id
  kind               enum('image', 'video', 'other')
  url                string    -- Bunny CDN / S3 URL
  filename           string
  sizeBytes          int
  createdAt          timestamp

repo_settings
  id                 uuid pk
  repoOwner          string
  repoName           string
  canSubmitIssue     boolean default true   -- 允許投稿？
  visibleOnUI        boolean default true   -- 前端 UI 是否顯示此 repo？
  updatedBy          uuid fk -> users.id nullable
  updatedAt          timestamp
  createdAt          timestamp
  unique (repoOwner, repoName)

audit_logs
  id                 uuid pk
  actorId            uuid fk -> users.id    -- 誰做的
  action             string                  -- 'role.grant' | 'role.revoke' | 'repo.update' | 'issue.approve' | 'issue.reject'
  targetType         string                  -- 'user' | 'repo' | 'issue'
  targetId           string                  -- 對應 PK（user id / repo owner-name / issue id）
  payload            jsonb                   -- 變更前後的關鍵欄位快照
  createdAt          timestamp
```

planner 可依選用的 ORM / DB 調整，但**欄位語意不要改**。

---

## 九、非功能需求

- **安全**
  - Google OAuth callback 驗證、CSRF 防護、SameSite cookie
  - 所有 API 以登入 session 驗證；管理員 API 額外檢查 `role = 'admin'`
  - 提交 issue 的 rate limit（防濫投，例：同一 user 每分鐘 ≤ 3 筆）
  - body markdown 提交前後端做 XSS / injection 清洗（渲染時用 markdown-it + DOMPurify 或同等）
  - 附件上傳限制：圖片 ≤ 10 MB、影片 ≤ 100 MB（planner 確認）
- **可觀測性**：NestJS 結構化 log（至少 info / warn / error），審核流程所有狀態變更要可追溯
- **i18n**：UI 全部 zh-Hant，沿用既有 design system；錯誤訊息、驗證訊息同樣中文
- **響應式**：Modal / Drawer 在手機上可用（mobile-first；md 斷點以上使用桌機樣式）
- **Accessibility**：表單有 label、ARIA、鍵盤操作可行

---

## 十、Open Questions（集中清單，planner 必須在 plan.md 先回答或回頭問用戶）

| # | 主題 | 候選 | 建議 |
|---|------|------|------|
| 2-1 | 撤銷最後一位 admin 是否允許 | 允許 / 禁止 / 需 root account | 禁止（防鎖死） |
| 4-3-1 | 訪客能否看 repo issue 列表 | 能 / 不能 | 能看公開 GitHub issue，不能看 pending 草稿 |
| 4-5-1 | V1 審核介面完整度 | API only / 最小 admin 頁 / 完整 admin 頁 | 最小 admin 頁（三分頁：issue 審核 / repo 設定 / 使用者權限） |
| 4-6-1 | archived / private repo 預設 visibleOnUI | 皆顯示 / archived 隱藏 / 兩者都隱藏 | archived 預設 `visibleOnUI=false`；private 不納入 |
| 4-6-2 | 新 repo 首次被 fetcher 發現時 repo_settings 初始化 | upsert / 不動 / 管理員手動 | fetcher 每輪 upsert（不存在才 insert，預設全 true） |
| 5-1 | 轉送到 GitHub 時是否加來源 label（例：`via-zenbu-milestones`） | 加 / 不加 | 加（方便追溯來源） |
| 6-1 | DB 技術棧 | PostgreSQL / MySQL / SQLite | PostgreSQL |
| 6-2 | 專案結構 | Monorepo / 另開 repo / `server/` 子目錄 | Monorepo（pnpm workspaces） |
| 6-3 | 後端 / DB 部署位置 | Railway / Render / Fly.io / 自架 | planner 列比較表 |
| 6-4 | repo issue 列表資料來源 | fetcher JSON / NestJS runtime | fetcher JSON |
| 7-1 | 附件策略 V1 | GitHub user-attachments / S3 / R2 / Bunny 全包 | 先 spike GitHub 是否可行，不行走 Bunny |
| 10-1 | 審核通知機制 | email / in-app / 兩者 / 先不做 | V2 再做 |
| 10-2 | Markdown 編輯器套件 | BlockNote / MDXEditor / @uiw/react-md-editor / 自幹 | planner 比較 GitHub 貼近度後推薦 |

---

## 十一、對既有專案的影響（planner 必讀）

> 這段幫 planner 預熱衝擊點，避免動到既有契約時失控。

- **`src/data/types.ts`** 是 build-time fetcher 與 SPA 之間的契約（見 `.claude/rules/data-contract.rule.md`）。若為新 UI 新增欄位，三端必須同步改。
- **Vite base path**：任何 URL 不得 hard-code `/zenbu-milestones/`，一律走 `import.meta.env.BASE_URL`（見 `.claude/rules/vite-base-path.rule.md`）。前端呼叫 NestJS 後端時要考量 dev / prod 環境不同 base URL，用 `import.meta.env.VITE_API_BASE_URL` 之類 env var。
- **HashRouter**：不可改 BrowserRouter（GitHub Pages 限制），新頁面都用 hash path。
- **樣式**：所有新 UI 必須優先用既有 CSS variable + `.btn-primary` / `.card` 等 class 元件，禁 emoji，圖示用 `lucide-react`（見 `.claude/rules/styling-system.rule.md`）。
- **套件管理**：pnpm only；若做 monorepo 要改 `pnpm-workspace.yaml`（見 `.claude/rules/pnpm-and-ci.rule.md`）。
- **CI**：既有 `build-and-deploy.yml` 的每小時 cron **保留**；若後端部署走獨立平台（Railway / Render），其 CI/CD 另議，不要混進 GitHub Pages 的 workflow。
- **fetcher 過濾邏輯擴充**：`canSubmitIssue` 改為「非 archived、非 private 就 true」；敏感 label 過濾（`SENSITIVE_LABELS`）保留。

---

## 十二、交付物（給 planner 的期望產出）

planner 應在 `specs/visitor-issue-submission/plan.md` 產出：

1. **架構圖**（前端 / fetcher / NestJS / DB / GitHub API / Bunny CDN 的資料流）
2. **Milestone 切分**：V1 的合理拆法（建議：M1 = OAuth + DB + 提交 API；M2 = 前端表單 + Modal/Drawer；M3 = 我的 issue 管理頁；M4 = 管理員後台三分頁（issue 審核 / repo 設定 / 使用者權限）+ GitHub 轉送；M5 = 附件；M6 = issue 列表搜尋 / filter）
3. **Open Questions 的建議解答 + 影響分析**
4. **風險登記表**（GitHub API rate limit、secret 洩漏、CORS、session 一致性、fetcher vs runtime 資料延遲⋯⋯）
5. **前置作業 checklist**（第一項必須是：rotate `BUNNY_STORAGE_PASSWORD`；第二項：簽發 `ZENBU_ORG_WRITE_TOKEN`）
6. **技術決策記錄**（Markdown 編輯器套件 / DB / ORM / 部署平台）
7. **與既有契約的差異**（types.ts 欄位新增、fetcher 過濾邏輯改動、vite.config 新增 env var）

輸出語言 zh-Hant，條列式，保留本文件的術語。
