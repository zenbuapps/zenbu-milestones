---
version: 0.2.0
date: 2026-04-20
status: draft
owner: planner
supersedes: 0.1.0
feature: visitor-issue-submission
scope_mode: EXPANSION
---

# 實作計劃：訪客登入後提交 GitHub Issue（V1）

> 本計劃取代 `v0.1.0`（Cloudflare Worker + Turnstile 匿名投稿方案）。
> 舊版方案已於 `prompt.md` 第三節全面作廢，**請勿**參考舊方案實作。

---

## 目錄

1. [概述](#1-概述)
2. [需求重述](#2-需求重述)
3. [架構圖與資料流](#3-架構圖與資料流)
4. [前置作業 Checklist（必須最先完成）](#4-前置作業-checklist)
5. [技術決策記錄（ADR）](#5-技術決策記錄adr)
6. [Milestone 切分（M1–M6）](#6-milestone-切分m1m6)
7. [M1 詳細實作步驟（立刻開工）](#7-m1-詳細實作步驟)
8. [資料流分析（Shadow Paths）](#8-資料流分析)
9. [錯誤處理登記表](#9-錯誤處理登記表)
10. [失敗模式登記表](#10-失敗模式登記表)
11. [風險登記表](#11-風險登記表)
12. [Open Questions 拍板紀錄](#12-open-questions-拍板紀錄)
13. [依賴關係圖（Dependency Graph）](#13-依賴關係圖)
14. [測試策略](#14-測試策略)
15. [與既有專案契約的差異](#15-與既有專案契約的差異)
16. [成功標準（DoD）](#16-成功標準dod)
17. [限制條件（Not In Scope）](#17-限制條件not-in-scope)
18. [預估複雜度](#18-預估複雜度)

---

## 1. 概述

讓任何使用者以 Google 帳號登入 `zenbu-milestones` 網站後，可對 `zenbuapps` 組織下所有公開 repo 提交 issue 草稿；草稿寫入後端 DB 待管理員審核，審核通過才由後端代呼 GitHub API 建立真實 issue。

本計劃把專案從 **純靜態 SPA** 翻轉為 **前後分離 + PostgreSQL 的 Monorepo 應用**，但同時**保留**既有 build-time fetcher 作為公開唯讀資料快取，降低後端 runtime 的 GitHub API 壓力。

V1 範圍：Google OAuth、issue 草稿 CRUD、最小管理員後台（審核 / repo 設定 / 使用者權限）、repo 投稿可見性控制、Markdown 編輯器、issue 列表搜尋 filter。V1 **不做** 附件上傳（僅留 spike 結論）、通知系統。

---

## 2. 需求重述

**服務對象**：`zenbuapps` 組織外部協作者（客戶、合作方、PM）與內部成員。

**核心價值**：把「我想回報一個需求 / bug」的門檻從「需要 GitHub 帳號 + 組織成員資格」降到「只需要 Google 帳號」，同時保留管理員守門避免垃圾 issue。

**成功的樣子**：

- 任何 Google 使用者登入後，能在 `zenbu-milestones` UI 上選擇目標 repo、填寫 Markdown issue、送出草稿
- 草稿在 DB 進入 `pending` 狀態，使用者能在「我的 issue 管理」頁追蹤進度
- 管理員審核通過後，後端自動代呼 GitHub API 建立 issue，下一輪 fetcher 跑完後該 issue 會出現在 repo 的 roadmap 頁
- 管理員能即時切換每個 repo 的 `visibleOnUI` / `canSubmitIssue` 旗標
- 管理員能指派 / 撤銷其他使用者的 admin 權限

---

## 3. 架構圖與資料流

```mermaid
flowchart TB
  subgraph External["外部服務"]
    GH["GitHub REST API<br/>(api.github.com)"]
    GOOG["Google OAuth<br/>(accounts.google.com)"]
    BUNNY["Bunny CDN<br/>(V2 附件用，V1 延後)"]
  end

  subgraph Hosted["後端託管平台（擬選 Railway）"]
    API["NestJS API<br/>apps/api"]
    DB[("PostgreSQL<br/>users / issues /<br/>repo_settings /<br/>audit_logs")]
    API <--> DB
  end

  subgraph GHPages["GitHub Pages (唯讀)"]
    FE["Vite SPA<br/>apps/web"]
    STATIC[("public/data/*.json<br/>summary / repos /<br/>repos/{name}.json")]
  end

  subgraph CI["GitHub Actions"]
    FETCHER["scripts/fetch-data.ts<br/>每小時 cron"]
  end

  %% Read path (公開，免登入)
  User((使用者瀏覽器)) -- "GET /zenbu-milestones/" --> FE
  FE -- "fetch(/data/summary.json)<br/>(BASE_URL)" --> STATIC
  FETCHER -- "ZENBU_ORG_READ_TOKEN" --> GH
  FETCHER -- "write JSON" --> STATIC
  FETCHER -- "upsert repo_settings" --> API

  %% Write path (需登入)
  User -- "Google OAuth redirect" --> GOOG
  GOOG -- "callback with code" --> API
  User -- "POST /api/issues<br/>(session cookie)" --> API
  API -- "ZENBU_ORG_WRITE_TOKEN<br/>(審核通過後)" --> GH

  %% My-issues read path (需登入)
  User -- "GET /api/me/issues" --> API

  %% V2 附件 (目前 not wired)
  API -.-> BUNNY
  BUNNY -.-> FE

  classDef readPath fill:#dbeafe,stroke:#2563eb
  classDef writePath fill:#fee2e2,stroke:#ef4444
  classDef deferred fill:#f3f4f6,stroke:#9ca3af,stroke-dasharray:5 5
  class FE,STATIC,FETCHER readPath
  class API,DB,GOOG writePath
  class BUNNY deferred
```

**資料流路徑分類**：

| 路徑 | 型別 | 觸發 | 認證 | 資料來源 |
|------|------|------|------|---------|
| `GET /zenbu-milestones/*` | 靜態 | 瀏覽器 | 無 | GitHub Pages (dist/) |
| `fetch(/data/summary.json)` | 靜態 | SPA 啟動 | 無 | `public/data/` JSON |
| `POST /api/auth/google` | API | 登入按鈕 | OAuth flow | Google + DB upsert |
| `POST /api/issues` | API | 提交表單 | session | DB write only |
| `GET /api/me/issues` | API | 我的 issue 頁 | session | DB read |
| `GET /api/admin/issues?status=pending` | API | 審核頁 | session + role=admin | DB read |
| `PATCH /api/admin/issues/:id/approve` | API | 審核通過 | session + role=admin | DB write + GitHub API |
| `PATCH /api/admin/repos/:owner/:name/settings` | API | repo 設定頁 | session + role=admin | DB write |
| `PATCH /api/admin/users/:id/role` | API | 權限管理頁 | session + role=admin | DB write + audit log |
| fetcher → `POST /api/internal/repo-settings/upsert` | 內部 API | CI 每小時 | internal token | DB write |

---

## 4. 前置作業 Checklist

> 這一節**必須**在任何程式碼工作開始前完成。由人（不是 tdd-coordinator）親自處理，因為涉及憑證。

- [ ] **Rotate `BUNNY_STORAGE_PASSWORD`**（**最高優先級**）
  - 理由：`prompt.md` 第七節的範例值視為已洩漏
  - 步驟：登入 Bunny 控制台 → Storage Zones → `git-action` → 重設密碼 → 新值**絕不**寫入任何文件 / commit / issue
  - 驗證：舊密碼在 Bunny API 回 401
  - 連帶檢查：`git log` / GitHub issue / Slack / Notion 搜尋舊值確認無殘留；若有，`git filter-repo` 或以新 commit 覆蓋（視影響面決定）
- [ ] **簽發 `ZENBU_ORG_WRITE_TOKEN`**（新的 fine-grained PAT）
  - Resource owner：`zenbuapps`
  - Repository access：All repositories
  - Permissions：Contents: Read、Issues: **Read & Write**、Metadata: Read
  - 90 天效期；到期前 2 週在 Actions schedule 提醒
  - **絕不**與既有 `ZENBU_ORG_READ_TOKEN` 共用
  - 儲存位置：後端部署平台 env var（Railway secrets），**不**上 GitHub Secrets（除非 CI 有需要）
- [ ] **申請 Google OAuth Client**
  - Google Cloud Console → APIs & Services → Credentials → Create OAuth 2.0 Client ID
  - Application type：Web application
  - Authorized redirect URIs：
    - `http://localhost:4000/api/auth/google/callback`（開發）
    - `https://<prod-api-domain>/api/auth/google/callback`（正式）
  - 下載 `client_id` / `client_secret` → 分別填入 `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`
- [ ] **決定後端部署網域**（影響 OAuth redirect 與前端 CORS）
  - 候選：`api.zenbu-milestones.example.com`（自有網域）或 Railway 自動子網域
  - 如果走自有網域：先在 DNS 設 CNAME，再申請 OAuth redirect URL
- [ ] **決定 PostgreSQL 託管**
  - 候選：Railway 內建 PG、Neon、Supabase（見 5.2 ADR）
  - 拍板：Railway 內建 PG（M1 初始）；若免費額度不足再遷 Neon
- [ ] **產生 `SESSION_SECRET`**
  - `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
  - 長度 ≥ 64 hex chars
- [ ] **確認 `INITIAL_ADMIN_EMAILS`**
  - 至少 1 位初始管理員的 Gmail（可能是使用者自己）
  - 逗號分隔，`a@gmail.com,b@gmail.com`

---

## 5. 技術決策記錄（ADR）

### 5.1 ADR-001：ORM 選擇 — **Prisma**

**候選**：Prisma v5 / TypeORM v0.3

**採用**：Prisma v5

**理由**：

| 維度 | Prisma | TypeORM |
|------|--------|---------|
| Schema 定義 | 獨立 DSL（`schema.prisma`），單一事實來源 | TypeScript decorator，分散於 entity 檔 |
| Migration | `prisma migrate dev/deploy`，自動 diff + SQL | `typeorm migration:generate`，需手動調整 |
| Type Safety | 自動產生 `@prisma/client`，query builder 完全型別安全 | 依賴 decorator，複雜 join 仍需手動型別 |
| NestJS 整合 | 成熟的 Prisma Service pattern | `@nestjs/typeorm` 一等支援 |
| V1 複雜度 | 低：`schema.prisma` + CLI 足夠 | 中：entity decorator + repository pattern |
| 效能 | 輕微開銷（query engine 位於獨立 binary） | 直接走 driver，但對此規模無感 |
| 社群 | 極活躍、文件佳 | 活躍但維護步調較慢 |

**否決理由（TypeORM）**：本專案資料模型穩定、schema 變動集中在 M1，Prisma 的「schema 作為 source of truth」開發體驗更好；且 `zenbu-powers:typeorm-v0-3` skill 雖可用但 Prisma 的 migration 工具鏈對 greenfield 更順。

**Trade-off**：

- Prisma 的 query engine binary（約 20MB）會進容器，但 Railway 映像檔限制寬鬆
- 若 V2 需要複雜 raw SQL / 自訂 driver（例：`pg_trgm` 全文檢索），Prisma 的 `$queryRaw` 仍可處理
- 若未來切換 DB 引擎成本略高（但 V1 就拍板 PostgreSQL，不會換）

**採用後衍生規範**：

- `schema.prisma` 位於 `apps/api/prisma/schema.prisma`
- 生成的 client 放 `apps/api/node_modules/.prisma/client`
- Migration 名稱遵循 `YYYYMMDDHHMMSS_description` 格式
- 每次 `schema.prisma` 變更必須跑 `pnpm --filter api prisma migrate dev --name <desc>` 並 commit migration SQL

### 5.2 ADR-002：後端部署平台 — **Railway**

**候選**：Railway / Render / Fly.io / 自架 VPS

| 維度 | Railway | Render | Fly.io | 自架 VPS |
|------|---------|--------|--------|---------|
| PostgreSQL 整合 | 內建一鍵開 PG（$5 起） | 內建 PG | 需外接（Neon / Supabase） | 自己裝 |
| 免費額度 | $5/月 trial；Hobby $5/月起 | Free tier 有（sleep after 15min） | $0 起但要綁卡 | 完全自付 |
| 冷啟動 | 無（常駐）| Free tier 會 sleep | 若縮到 0 instance 有 | 無 |
| CI/CD | Git push 自動部署；也支援 `railway up` | Git push 自動部署 | `fly deploy` 手動 / GHA | 自己寫 workflow |
| Region | 美國 / EU / 亞洲（Singapore）可選 | 美國為主，亞洲需付費 | 全球 edge，自動 Tokyo 可用 | 自選 |
| 台灣延遲 | Singapore region ~60ms | 美國 ~180ms | Tokyo ~50ms | 視供應商 |
| 機密管理 | Railway Variables（UI 可貼值） | Env Groups | Secrets（CLI） | 自己管 `.env` |
| 學習曲線 | 最低 | 低 | 中（需懂 fly.toml） | 高 |
| Vendor Lock-in | 低（標準 Docker） | 低 | 中（Fly machines 概念較獨特） | 無 |
| 監控 | 內建 log + metrics | 內建 | 需 grafana 外接 | 自己裝 |

**採用**：**Railway**

**推薦理由**：

1. **DB 與 API 同平台**：網路延遲最低、單一 dashboard 管理，V1 不需要為 DB 另找 Neon/Supabase
2. **台灣延遲可接受**：Singapore region 實測 ~60ms，優於 Render 美國機房
3. **CI/CD 零設定**：連 GitHub repo 即自動部署，M1 省下寫 Dockerfile 與 GHA workflow 的時間
4. **Vendor Lock-in 低**：底層是標準 Docker，日後要遷到 Fly.io 容器能直接搬

**否決理由**：

- **Render**：Free tier 冷啟動體驗差；付費版與 Railway 價位類似但區位劣勢
- **Fly.io**：Tokyo region 延遲最低，但 fly.toml + machines 對 MVP 過度複雜；V1 團隊學習成本不值得
- **自架 VPS**：營運負擔（備份 / 安全更新 / HTTPS 續簽）超出 V1 目標

**Trade-off**：

- Railway 價格隨用量成長（$5/月起跳，issues 量大時可能 >$20/月），V2 若成本敏感可評估遷 Fly.io 或 Cloudflare Workers + Neon
- Railway 的 PostgreSQL 備份需手動排程（目前僅 snapshot on demand）——M1 落地後立刻設 pg_dump cron 到 S3

### 5.3 ADR-003：Markdown 編輯器 — **@uiw/react-md-editor**

**候選**：BlockNote / MDXEditor / @uiw/react-md-editor

| 維度 | BlockNote | MDXEditor | @uiw/react-md-editor |
|------|-----------|-----------|----------------------|
| 編輯模式 | Block-based（Notion 風）| WYSIWYG + Markdown hybrid | 分割預覽（左寫右看）|
| GitHub Flavored Markdown 貼近度 | 中（輸出是 BlockNote JSON，需轉 Markdown）| 高（內建 GFM）| **最高**（本身就是 Markdown，GFM 支援完整）|
| 語法可見性 | 隱藏（不是 Markdown 介面）| 混合（工具列 + Markdown 編輯） | 完全顯示（GitHub 體驗）|
| Bundle 大小（gzipped） | ~200KB（含 ProseMirror）| ~180KB（含 Lexical）| **~80KB**（單純 textarea + markdown-it 預覽）|
| 附件拖拉 | 內建（但吐 BlockNote block）| 內建（需自己寫 uploader callback） | 內建（需自己寫 `onImageUpload`）|
| 程式碼塊語法高亮 | 內建 highlight.js | 內建 Lexical highlight | 需額外接 `rehype-highlight` |
| 可維護性 / 文件 | 活躍，文件清楚 | 活躍，稍微前衛 | 穩定，API 簡單 |
| TypeScript 支援 | 完整 | 完整 | 完整 |
| 與 GitHub 原生相似度 | 低（block UI 完全不同）| 中（工具列）| **高**（幾乎就是 GitHub 的 issue 編輯器）|
| 與既有 Tailwind + design system 整合 | 需 override CSS | 需 override CSS | 最容易（textarea 可直接套 `.input` class）|

**採用**：**@uiw/react-md-editor**

**推薦理由**：

1. **需求明文要求「盡量貼近 GitHub 體驗」** —— `@uiw/react-md-editor` 本質上就是 Markdown + 預覽，對使用者來說學習成本最低
2. **Bundle 最小**：~80KB 比 BlockNote 少一半，對 GitHub Pages 靜態站的 LCP 更友善
3. **GFM 支援最完整**：table / task list / strikethrough 皆原生支援，不用額外接 plugin
4. **V1 暫不做附件，編輯器的附件上傳機制影響力弱**：若 V2 要接 Bunny，`onImageUpload` callback 寫起來簡單直觀
5. **既有 design system 友善**：可直接套 `.input` / `.card` 而不需覆蓋複雜 CSS

**否決理由**：

- **BlockNote**：block-based UI 對寫過 GitHub issue 的使用者是**反直覺**（需要學新的編輯範式），且輸出要轉 Markdown 額外增加一層資料流
- **MDXEditor**：WYSIWYG 體驗好但不是使用者期待的「GitHub-like」，且 Lexical engine 在 React 18 下偶有 stale closure 問題

**Trade-off**：

- 程式碼塊語法高亮需額外接 `rehype-highlight`（小代價，M2 實作時加）
- 預覽樣式要自己匹配 `.card` 外觀（M2 會把 GFM HTML 輸出包進 `.prose` 風格的 Tailwind utility）

---

## 6. Milestone 切分（M1–M6）

### M1 — OAuth + DB + 提交 API（首發，**詳寫於第 7 節**）

**目的**：建立 Monorepo 骨架、NestJS 後端、PostgreSQL schema、Google OAuth、`POST /api/issues`、`GET /api/me/issues` 最小寫入路徑能跑通 end-to-end（不含前端 UI，用 curl / Postman 驗證）。

**檔案變更表**：

| 類型 | 路徑 | 動作 |
|------|------|------|
| 新 | `pnpm-workspace.yaml` | 新增 Monorepo config |
| 移動 | 所有 `src/**/*` → `apps/web/src/**/*` | 既有前端遷入 workspace |
| 移動 | `public/**` → `apps/web/public/**` | 同上 |
| 移動 | `scripts/fetch-data.ts` → `apps/web/scripts/fetch-data.ts` | 保留前端側 |
| 移動 | `vite.config.ts` / `tailwind.config.js` / `postcss.config.js` → `apps/web/` | Vite workspace |
| 移動 | `tsconfig*.json` → `apps/web/` | workspace TS |
| 新 | `apps/api/` | NestJS skeleton |
| 新 | `apps/api/prisma/schema.prisma` | Prisma schema |
| 新 | `apps/api/prisma/migrations/*` | Initial migration |
| 新 | `apps/api/src/` | Controllers / Services / DTOs |
| 新 | `apps/api/.env.example` | Secret keys |
| 新 | `packages/shared/` | 跨端型別（Issue / User enums） |
| 改 | `package.json`（root） | 改成 workspace root |
| 改 | `.github/workflows/build-and-deploy.yml` | paths filter 改 `apps/web/**` |
| 改 | `.gitignore` | `apps/api/.env`、`apps/api/dist/` |

**驗收標準**：

- [ ] `pnpm install` 在 root 目錄能裝好兩個 workspace
- [ ] `pnpm --filter web dev` 開得起 SPA（連到 `http://localhost:5173/zenbu-milestones/`）
- [ ] `pnpm --filter api start:dev` 開得起 NestJS（`http://localhost:4000/api/health` 回 200）
- [ ] `pnpm --filter api prisma migrate dev` 能建立所有 5 張表
- [ ] Google OAuth flow：`GET /api/auth/google` 轉跳 → callback → 寫入 `users` → 回 session cookie
- [ ] 登入後 `POST /api/issues` 能寫入 DB（status=pending）
- [ ] 登入後 `GET /api/me/issues` 能讀回自己的 issue
- [ ] 未登入呼叫 `POST /api/issues` 回 401
- [ ] `INITIAL_ADMIN_EMAILS` 內的帳號首次登入後 DB `role='admin'`
- [ ] CI 繼續跑 `build-and-deploy.yml`，部署 `apps/web` 到 GitHub Pages 無迴歸
- [ ] `apps/web` 呼叫後端時走 `import.meta.env.VITE_API_BASE_URL`（未注入時 graceful degrade 為「無後端」模式，既有唯讀 UI 不受影響）

**依賴**：前置作業 checklist 全部完成

**風險**：**中**

- Monorepo 遷移過程可能漏搬 `tsconfig.json` 的 project reference，造成 `pnpm build` 連鎖失敗
- OAuth callback 在 local dev 需 `http://localhost:4000/...`，正式環境需 HTTPS；redirect URI 兩組要同時申請
- Prisma migration 的 initial commit 要小心 —— migration 一旦 apply 到正式 DB 就不能刪（只能 forward migration）

**Rollback**：

- Monorepo 遷移失敗 → `git checkout HEAD^` 回退；因為是**檔案移動 + 新增**，git 可乾淨還原
- OAuth 故障 → 關閉 `VITE_API_BASE_URL` env var，前端退回純唯讀模式，既有功能完全不受影響
- DB schema 錯誤 → 刪 Railway PG instance 重來（M1 階段 DB 內容可拋棄）

**複雜度**：**高**（最大 Milestone，有 Monorepo 改造 + 新增完整後端 stack）

### M2 — 前端表單 Modal/Drawer + Markdown 編輯器

**目的**：在 `RoadmapPage` 加「提出 issue」按鈕，點擊開啟表單（Modal 或 Drawer）；使用 `@uiw/react-md-editor` 填內容；送出走 M1 的 `POST /api/issues`。

**檔案變更表**：

| 類型 | 路徑 | 動作 |
|------|------|------|
| 新 | `apps/web/src/components/IssueSubmitForm.tsx` | 表單主體（標題 + Markdown） |
| 新 | `apps/web/src/components/IssueSubmitDialog.tsx` | Modal 或 Drawer 外層（由 `zenbuapps-design-system` skill 拍板） |
| 新 | `apps/web/src/data/api.ts` | `fetch(VITE_API_BASE_URL/api/...)` 封裝、自動帶 cookie |
| 新 | `apps/web/src/hooks/useSession.ts` | 讀當前登入狀態（呼叫 `/api/me`）|
| 新 | `apps/web/src/components/GoogleLoginButton.tsx` | 登入按鈕（redirect 到 `/api/auth/google`） |
| 改 | `apps/web/src/pages/RoadmapPage.tsx` | 新增「提出 issue」CTA 按鈕 |
| 改 | `apps/web/src/components/TopNav.tsx` | 新增登入狀態顯示 + 登入/登出按鈕 |
| 新依賴 | `@uiw/react-md-editor@^4` | Markdown 編輯器 |
| 新依賴 | `rehype-sanitize` | 預覽時做 XSS 清洗 |

**Modal vs Drawer 決策**（須呼叫 `/zenbuapps-design-system` skill 確認）：

- 桌機 `md` 以上 → Modal（置中對話框，寬 `max-w-3xl`）
- 手機 < `md` → Drawer（從下方滑入，高度 85vh）
- 這符合既有設計系統「對話內容需要大量輸入時優先 Drawer on mobile」的慣例

**驗收標準**：

- [ ] 已登入使用者在任何 repo roadmap 頁都看得到「提出 issue」按鈕
- [ ] 未登入時按鈕顯示「請先登入後提交 issue」並連到 `/api/auth/google`
- [ ] Modal / Drawer 開啟後能輸入標題 + Markdown 內容、看到即時預覽
- [ ] 送出後顯示「草稿已送出，待審核中」並關閉 dialog
- [ ] 標題 > 256 字被前端攔截 + 顯示錯誤
- [ ] 內容空白 / 標題空白 無法送出（按鈕 disabled）
- [ ] 送出中 button 顯示 loading，不允許重複點擊（防 double-submit）
- [ ] API 回 403（該 repo `canSubmitIssue=false`） 時顯示「此 repo 暫不接受投稿」
- [ ] API 回 429（rate limited） 時顯示「送出太頻繁，請稍後」
- [ ] 表單在 mobile 寬度 360px 下可用（輸入框不溢出）

**依賴**：M1 完成

**風險**：**中**

- Markdown 編輯器預覽側的 XSS（使用者貼入惡意 HTML）——必用 `rehype-sanitize`
- Modal 在 mobile 鍵盤彈出時會被遮蓋——`max-h-[85vh] overflow-y-auto` + `scroll-into-view`

**Rollback**：把 `<IssueSubmitDialog>` 的 mount 拔掉，既有 SPA 功能完全不受影響

**複雜度**：**中**

### M3 — 我的 Issue 管理頁

**目的**：`/#/me/issues` 頁面，列當前登入使用者所有 issue 草稿 + 已轉送的 GitHub issue。

**檔案變更表**：

| 類型 | 路徑 | 動作 |
|------|------|------|
| 新 | `apps/web/src/pages/MyIssuesPage.tsx` | 列表 UI |
| 新 | `apps/web/src/components/IssueStatusBadge.tsx` | pending / approved / rejected / synced-to-github 四色徽章 |
| 改 | `apps/web/src/App.tsx` | 新增 `<Route path="me/issues" ...>` |
| 改 | `apps/web/src/components/TopNav.tsx` | 登入後下拉選單新增「我的 issue」連結 |

**驗收標準**：

- [ ] 登入後能看到自己歷史提交的全部 issue（依 `createdAt desc` 排序）
- [ ] 每筆顯示：標題、所屬 repo、狀態徽章、建立時間、（若 rejected）審核備註、（若 synced）GitHub issue 連結
- [ ] 未登入訪問該路徑直接導去登入
- [ ] 空狀態（0 筆）顯示引導訊息：「你還沒提交過 issue，到任一 repo roadmap 頁面開始吧」
- [ ] 列表分頁（V1 先 100 筆硬上限，不做分頁 UI；V2 再加）

**依賴**：M1、M2（為了讓使用者至少有一筆資料）

**風險**：**低**

**Rollback**：拔 `<Route>` 即可

**複雜度**：**低**

### M4 — 管理員後台三分頁 + GitHub 轉送

**目的**：`/#/admin` 下三個分頁（issue 審核 / repo 設定 / 使用者權限），審核通過時後端代呼 GitHub API 建 issue。

**檔案變更表**：

| 類型 | 路徑 | 動作 |
|------|------|------|
| 新 | `apps/web/src/pages/AdminPage.tsx` | 三分頁 layout |
| 新 | `apps/web/src/components/admin/IssueReviewTable.tsx` | pending issue 列表 + 通過 / 拒絕按鈕 |
| 新 | `apps/web/src/components/admin/RepoSettingsTable.tsx` | repo 列表 + `canSubmitIssue` / `visibleOnUI` toggle |
| 新 | `apps/web/src/components/admin/UserRoleTable.tsx` | 使用者列表 + role toggle + 稽核 log |
| 改 | `apps/web/src/App.tsx` | 新增 `<Route path="admin" ...>` |
| 改 | `apps/web/src/AppShell.tsx` | role=admin 時 TopNav 顯示「後台」連結 |
| 新 | `apps/api/src/admin/admin.module.ts` | NestJS admin 模組 |
| 新 | `apps/api/src/admin/admin.controller.ts` | 所有 `/api/admin/*` endpoints |
| 新 | `apps/api/src/common/guards/admin.guard.ts` | 檢查 `req.user.role === 'admin'` |
| 新 | `apps/api/src/github/github.service.ts` | 包裝 `@octokit/rest`（使用 `ZENBU_ORG_WRITE_TOKEN`）|
| 新 | `apps/api/src/audit/audit.service.ts` | 寫 `audit_logs` |

**新 API endpoints**：

- `GET /api/admin/issues?status=pending&limit=50` — 列 pending issue
- `POST /api/admin/issues/:id/approve` — 審核通過 → 呼 GitHub API → 更新 `githubIssueNumber`
- `POST /api/admin/issues/:id/reject` — 拒絕 → body `{ reason: string }`
- `GET /api/admin/repos` — 列所有 repo_settings
- `PATCH /api/admin/repos/:owner/:name/settings` — 更新 `canSubmitIssue` / `visibleOnUI`
- `GET /api/admin/users` — 列使用者
- `PATCH /api/admin/users/:id/role` — 變更 role
- `GET /api/admin/audit-logs?limit=50` — 最近稽核紀錄

**驗收標準**：

- [ ] 非 admin 使用者訪問 `/#/admin` 被 redirect 到首頁（前端 guard）
- [ ] 非 admin 呼叫任何 `/api/admin/*` 回 403（後端 guard）
- [ ] 審核通過 → GitHub 上真的出現該 issue（帶 `via-zenbu-milestones` label）
- [ ] 審核失敗（GitHub API 回 422 等）→ DB status 保持 `pending`，不轉為 `synced-to-github`，錯誤訊息顯示給 admin
- [ ] repo 設定切換後，前端下次 `loadSummary()` 能反映（或直接 context 更新）
- [ ] role 變更即時寫 `audit_logs` 一筆
- [ ] 使用者不能改自己的 role（後端檢查 `req.user.id !== targetUserId`）
- [ ] 最後一位 admin 不能被撤銷（後端 count active admin 後拒絕）
- [ ] issue 審核通過時，若 repo `canSubmitIssue=false`，**仍允許審核**（設定只限制新投稿，不阻擋既有 pending）
- [ ] rate limit：`ZENBU_ORG_WRITE_TOKEN` 的 remaining 低於 100 時，後端拒絕新審核並顯示「請稍後再試」

**依賴**：M1、M3（我的 issue 頁須已能呈現審核結果）

**風險**：**高**

- GitHub API rate limit（authenticated 5000/hr）如果 fetcher + 代轉共用同一組 PAT 會互相排擠 —— 已切分成兩組 PAT 解決
- 審核通過 → GitHub API 成功 → DB 寫失敗的**原子性**問題：採「樂觀寫法」：先呼 GitHub，成功後再 `prisma.issue.update`，即使 DB 寫失敗也只是狀態不一致（下次 fetcher 會自動修正，因為 `githubIssueNumber` 能反向查到 issue）
- CSRF：admin 操作是 `POST/PATCH`，一律要求 `X-CSRF-Token` header
- 「最後一位 admin」判斷在並發場景下可能有 race condition（兩個 admin 同時撤銷彼此）—— 用 DB transaction + SERIALIZABLE isolation

**Rollback**：拔 `AdminPage` 的 route；後端 `/api/admin/*` controller 可保留（沒人呼）

**複雜度**：**高**

### M5 — 附件（V2，plan.md 留框架）

**目的**：V1 **不實作**，但先做 spike + 留架構。

**V1 Spike 任務**：**GitHub REST API 附件上傳調查**

- 研究 `POST /repos/{owner}/{repo}/issues` 的 `body` 參數是否能接受 `![image](https://...)` markdown 並讓 GitHub 正常渲染
- 研究 `POST /user/memes`（未公開 API）上傳 user-attachment 的可行性（已知 GitHub 官方**不提供** issue attachment 上傳 API）
- 結論**預測**：GitHub 不提供直接 API；必須自己託管附件（Bunny CDN）再把 CDN URL 嵌入 markdown
- Spike 產出物：`specs/visitor-issue-submission/spike-attachments.md`（1-2 頁結論 + 建議方案）

**V2 實作框架（僅列 skeleton，不做）**：

- `apps/api/src/attachments/attachments.module.ts` — Bunny CDN 上傳封裝
- `POST /api/attachments` — 前端 chunk upload endpoint
- DB `issue_attachments` 表 schema 已在 M1 建立（但 M1 只留空表）
- 前端：`@uiw/react-md-editor` 的 `onImageUpload` callback 串接

**驗收標準**：V1 階段僅 spike 結論產出、`issue_attachments` 表存在但不寫入

**依賴**：M1（DB schema）

**複雜度**：**中**（V2）/ **低**（V1 spike）

### M6 — Issue 列表搜尋 / Filter

**目的**：在 `RoadmapPage` 新增 issue 列表 + 搜尋 filter（參考 GitHub issues UI）。

**檔案變更表**：

| 類型 | 路徑 | 動作 |
|------|------|------|
| 新 | `apps/web/src/components/RepoIssueList.tsx` | 列表 + filter |
| 新 | `apps/web/src/components/IssueFilterBar.tsx` | 狀態 / label / milestone / assignee / keyword |
| 改 | `apps/web/src/pages/RoadmapPage.tsx` | 嵌入 RepoIssueList |
| 改 | `apps/web/scripts/fetch-data.ts` | 擴充 `RepoDetail.issues` 包含所有 repo issue（不只 milestone 內的） |
| 改 | `apps/web/src/data/types.ts` | `RepoDetail` 新增 `allIssues: IssueLite[]`（**三端同步！見 data-contract rule**） |

**過濾能力（V1 必備）**：

- 狀態：`open` / `closed` / `all`
- Label：單選 / 多選
- Milestone：單選
- Assignee：單選
- 關鍵字：標題 + body 子字串匹配（client-side）

**訪客能否看**：**能**（已同步到 GitHub 的 public issue），pending 草稿僅作者可見

**驗收標準**：

- [ ] 每個 repo 頁面有完整 issue 列表
- [ ] 5 種 filter 可組合使用
- [ ] Filter 狀態存 URL query string（`?state=open&label=bug`）以便分享連結
- [ ] 未登入訪客能看 public issue 列表但看不到自己（的）pending 草稿
- [ ] 登入使用者能在列表額外看到「我的 pending 草稿」一個獨立 section
- [ ] 列表 > 100 筆時有載入更多 / 虛擬滾動（V1 簡單 `slice(0, 100)` + 「載入更多」按鈕即可）

**依賴**：M1（為了 pending 草稿資料）

**風險**：**中**

- fetcher 擴充要抓全 repo issue（不只 milestone 內），`p-limit` 要調整避免觸發 rate limit
- `types.ts` 變更 → 三端同步檢查（`fetch-data.ts`、`loader.ts`、所有消費端）依 `.claude/rules/data-contract.rule.md` 第 1 條

**Rollback**：拔 `<RepoIssueList>`，其他功能不受影響

**複雜度**：**中**

---

## 7. M1 詳細實作步驟

> 本節詳寫到 tdd-coordinator 可直接開工的顆粒度。

### 7.1 Monorepo 初始化

**前提**：在專案根目錄 `C:\Users\User\DEV\zenbu\zenbu-milestones\` 操作。既有 `src/`、`public/`、`scripts/`、`vite.config.ts` 等檔案將移入 `apps/web/`。

#### 步驟 7.1.1 — 建立 workspace 設定

新建 `pnpm-workspace.yaml`：

```yaml
packages:
  - apps/*
  - packages/*
```

#### 步驟 7.1.2 — 重組目錄

```bash
mkdir -p apps/web apps/api packages/shared
git mv src apps/web/src
git mv public apps/web/public
git mv scripts apps/web/scripts
git mv index.html apps/web/index.html
git mv vite.config.ts apps/web/vite.config.ts
git mv tailwind.config.js apps/web/tailwind.config.js
git mv postcss.config.js apps/web/postcss.config.js
git mv tsconfig.json apps/web/tsconfig.json
git mv tsconfig.app.json apps/web/tsconfig.app.json
git mv tsconfig.node.json apps/web/tsconfig.node.json
```

（對應 scripts/ 的 `tsconfig` 也一起搬。）

#### 步驟 7.1.3 — 拆分 package.json

**根目錄 `package.json`**（workspace root）：

```json
{
  "name": "zenbu-milestones-monorepo",
  "private": true,
  "packageManager": "pnpm@10.32.1",
  "scripts": {
    "dev:web": "pnpm --filter web dev",
    "dev:api": "pnpm --filter api start:dev",
    "dev:all": "pnpm -r --parallel run dev",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "fetch-data": "pnpm --filter web fetch-data"
  },
  "devDependencies": {
    "typescript": "^5.6.3"
  }
}
```

**`apps/web/package.json`**（從既有 `package.json` 搬過來，`name` 改 `web`）：依賴清單沿用既有 + 新增 `shared: workspace:*`（M1 可暫不加 `@uiw/react-md-editor`，留到 M2）。

**`apps/api/package.json`** — NestJS 後端，依賴清單：

```jsonc
{
  "name": "api",
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/config": "^3.3.0",
    "@nestjs/passport": "^11.0.0",
    "@nestjs/platform-express": "^11.0.0",
    "@octokit/rest": "^21.0.2",
    "@prisma/client": "^5.22.0",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "express-session": "^1.18.1",
    "passport": "^0.7.0",
    "passport-google-oauth20": "^2.0.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "shared": "workspace:*"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/testing": "^11.0.0",
    "@types/express-session": "^1.18.0",
    "@types/node": "^22.10.1",
    "@types/passport-google-oauth20": "^2.0.16",
    "prisma": "^5.22.0",
    "ts-node": "^10.9.2",
    "typescript": "^5.6.3"
  },
  "scripts": {
    "start:dev": "nest start --watch",
    "start:prod": "node dist/main.js",
    "build": "nest build",
    "typecheck": "tsc --noEmit",
    "prisma:migrate:dev": "prisma migrate dev",
    "prisma:migrate:deploy": "prisma migrate deploy"
  }
}
```

**`packages/shared/package.json`**：單純 TS 型別 package，`main` 與 `types` 指向 `./src/index.ts`。

#### 步驟 7.1.4 — 驗證 web 部分沒壞

```bash
pnpm install
pnpm --filter web dev     # 確認仍能開起既有 SPA
pnpm --filter web build   # 確認 production build 無錯
```

如果 build 壞了，優先修 `tsconfig.app.json` 內的 `include` / `references` 指向新路徑。

### 7.2 NestJS Skeleton 建立

#### 步驟 7.2.1 — 初始化

```bash
cd apps/api
pnpm exec nest new . --package-manager pnpm --skip-git --skip-install
pnpm install
```

> **注意**：`nest new .` 會建在當前目錄；記得刪除其自動建立的 `.git` 子目錄（nest CLI bug）。

#### 步驟 7.2.2 — 精簡目錄結構

刪除 `src/app.controller.spec.ts`、`src/app.controller.ts`、`src/app.service.ts`（V1 不做測試；也不需要預設 Hello World controller）。

預期結構：

```
apps/api/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── auth/
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── auth.module.ts
│   │   ├── google.strategy.ts
│   │   └── session.serializer.ts
│   ├── users/
│   │   ├── users.service.ts
│   │   └── users.module.ts
│   ├── issues/
│   │   ├── issues.controller.ts
│   │   ├── issues.service.ts
│   │   ├── issues.module.ts
│   │   └── dto/create-issue.dto.ts
│   ├── me/
│   │   └── me.controller.ts
│   ├── repo-settings/
│   │   ├── repo-settings.service.ts
│   │   └── repo-settings.module.ts
│   ├── prisma/
│   │   └── prisma.service.ts
│   ├── common/
│   │   └── guards/authenticated.guard.ts
│   ├── health/
│   │   └── health.controller.ts
│   ├── app.module.ts
│   └── main.ts
└── .env.example
```

#### 步驟 7.2.3 — `apps/api/src/main.ts`

```ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as session from 'express-session';
import * as passport from 'passport';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: process.env.WEB_ORIGIN?.split(',') ?? [],
    credentials: true,
  });
  app.use(
    session({
      secret: process.env.SESSION_SECRET!,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      },
    }),
  );
  app.use(passport.initialize());
  app.use(passport.session());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  console.log(`[api] listening on http://localhost:${port}/api`);
}

bootstrap().catch((err) => {
  console.error('[api] bootstrap failed', err);
  process.exit(1);
});
```

#### 步驟 7.2.4 — Health check

`apps/api/src/health/health.controller.ts`：

```ts
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
```

驗證：`pnpm --filter api start:dev` → `curl http://localhost:4000/api/health` → 200。

### 7.3 PostgreSQL Schema 初始化

#### 步驟 7.3.1 — `apps/api/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  user
  admin
}

enum IssueStatus {
  pending
  approved
  rejected
  synced_to_github
}

enum AttachmentKind {
  image
  video
  other
}

model User {
  id                   String    @id @default(uuid())
  googleSub            String    @unique
  email                String    @unique
  displayName          String
  avatarUrl            String?
  role                 UserRole  @default(user)
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt

  issuesAuthored       Issue[]         @relation("IssueAuthor")
  issuesReviewed       Issue[]         @relation("IssueReviewer")
  repoSettingsUpdated  RepoSettings[]
  auditLogs            AuditLog[]

  @@map("users")
}

model Issue {
  id                String       @id @default(uuid())
  authorId          String
  author            User         @relation("IssueAuthor", fields: [authorId], references: [id])
  repoOwner         String
  repoName          String
  title             String       @db.VarChar(256)
  bodyMarkdown      String       @db.Text
  status            IssueStatus  @default(pending)
  githubIssueNumber Int?
  githubIssueUrl    String?
  reviewedById      String?
  reviewedBy        User?        @relation("IssueReviewer", fields: [reviewedById], references: [id])
  reviewedAt        DateTime?
  rejectReason      String?      @db.Text
  createdAt         DateTime     @default(now())
  updatedAt         DateTime     @updatedAt

  attachments       IssueAttachment[]

  @@index([authorId, createdAt])
  @@index([status, createdAt])
  @@index([repoOwner, repoName])
  @@map("issues")
}

model IssueAttachment {
  id         String         @id @default(uuid())
  issueId    String
  issue      Issue          @relation(fields: [issueId], references: [id], onDelete: Cascade)
  kind       AttachmentKind
  url        String
  filename   String
  sizeBytes  Int
  createdAt  DateTime       @default(now())

  @@index([issueId])
  @@map("issue_attachments")
}

model RepoSettings {
  id              String   @id @default(uuid())
  repoOwner       String
  repoName        String
  canSubmitIssue  Boolean  @default(true)
  visibleOnUI     Boolean  @default(true)
  updatedById     String?
  updatedBy       User?    @relation(fields: [updatedById], references: [id])
  updatedAt       DateTime @updatedAt
  createdAt       DateTime @default(now())

  @@unique([repoOwner, repoName])
  @@map("repo_settings")
}

model AuditLog {
  id          String   @id @default(uuid())
  actorId     String
  actor       User     @relation(fields: [actorId], references: [id])
  action      String   // 'role.grant' | 'role.revoke' | 'repo.update' | 'issue.approve' | 'issue.reject'
  targetType  String   // 'user' | 'repo' | 'issue'
  targetId    String
  payload     Json
  createdAt   DateTime @default(now())

  @@index([actorId, createdAt])
  @@index([targetType, targetId])
  @@map("audit_logs")
}
```

#### 步驟 7.3.2 — 初始 migration

```bash
cd apps/api
pnpm exec prisma migrate dev --name init
pnpm exec prisma generate
```

產出：`apps/api/prisma/migrations/<timestamp>_init/migration.sql`（務必 commit）。

#### 步驟 7.3.3 — `PrismaService`

`apps/api/src/prisma/prisma.service.ts`：

```ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

在 `app.module.ts` providers 列出、exports 出去讓其他 module 用。

### 7.4 Google OAuth 設定

#### 步驟 7.4.1 — `GoogleStrategy`

`apps/api/src/auth/google.strategy.ts`：

```ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { UsersService } from '../users/users.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private readonly usersService: UsersService) {
    super({
      clientID: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      callbackURL: process.env.GOOGLE_OAUTH_CALLBACK_URL!,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ) {
    try {
      const email = profile.emails?.[0]?.value;
      if (!email) return done(new Error('Google profile missing email'));

      const user = await this.usersService.upsertFromGoogle({
        googleSub: profile.id,
        email,
        displayName: profile.displayName ?? email,
        avatarUrl: profile.photos?.[0]?.value ?? null,
      });
      done(null, user);
    } catch (err) {
      done(err as Error);
    }
  }
}
```

#### 步驟 7.4.2 — Session Serializer

`apps/api/src/auth/session.serializer.ts`：

```ts
import { Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';
import { UsersService } from '../users/users.service';

@Injectable()
export class SessionSerializer extends PassportSerializer {
  constructor(private readonly usersService: UsersService) {
    super();
  }

  serializeUser(user: { id: string }, done: (err: unknown, id?: string) => void) {
    done(null, user.id);
  }

  async deserializeUser(id: string, done: (err: unknown, user?: unknown) => void) {
    try {
      const user = await this.usersService.findById(id);
      done(null, user ?? false);
    } catch (err) {
      done(err);
    }
  }
}
```

#### 步驟 7.4.3 — `AuthController`

`apps/api/src/auth/auth.controller.ts`：

```ts
import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';

@Controller('auth')
export class AuthController {
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleLogin() {
    // Redirects to Google OAuth consent screen
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  googleCallback(@Req() _req: Request, @Res() res: Response) {
    const webOrigin = (process.env.WEB_ORIGIN?.split(',') ?? [])[0] ?? '/';
    res.redirect(webOrigin);
  }

  @Get('logout')
  logout(@Req() req: Request, @Res() res: Response) {
    req.logout(() => {
      req.session.destroy(() => {
        res.redirect('/');
      });
    });
  }
}
```

#### 步驟 7.4.4 — `UsersService` with `INITIAL_ADMIN_EMAILS`

`apps/api/src/users/users.service.ts`：

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  private readonly initialAdminEmails: Set<string>;

  constructor(private readonly prisma: PrismaService) {
    this.initialAdminEmails = new Set(
      (process.env.INITIAL_ADMIN_EMAILS ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  async upsertFromGoogle(input: {
    googleSub: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
  }) {
    const emailLower = input.email.toLowerCase();
    const isInitialAdmin = this.initialAdminEmails.has(emailLower);

    return this.prisma.user.upsert({
      where: { googleSub: input.googleSub },
      update: {
        email: emailLower,
        displayName: input.displayName,
        avatarUrl: input.avatarUrl,
      },
      create: {
        googleSub: input.googleSub,
        email: emailLower,
        displayName: input.displayName,
        avatarUrl: input.avatarUrl,
        role: isInitialAdmin ? 'admin' : 'user',
      },
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }
}
```

#### 步驟 7.4.5 — `AuthenticatedGuard`

`apps/api/src/common/guards/authenticated.guard.ts`：

```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class AuthenticatedGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    return Boolean(req.isAuthenticated?.() && req.user);
  }
}
```

### 7.5 `POST /api/issues` + `GET /api/me/issues`

#### 步驟 7.5.1 — DTO

`apps/api/src/issues/dto/create-issue.dto.ts`：

```ts
import { IsNotEmpty, IsString, MaxLength, Matches } from 'class-validator';

export class CreateIssueDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9_.-]+$/)
  repoOwner!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9_.-]+$/)
  repoName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(65_535)
  bodyMarkdown!: string;
}
```

#### 步驟 7.5.2 — `IssuesController`

`apps/api/src/issues/issues.controller.ts`：

```ts
import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { CreateIssueDto } from './dto/create-issue.dto';
import { IssuesService } from './issues.service';

@Controller('issues')
@UseGuards(AuthenticatedGuard)
export class IssuesController {
  constructor(private readonly issuesService: IssuesService) {}

  @Post()
  async create(@Req() req: any, @Body() dto: CreateIssueDto) {
    const issue = await this.issuesService.createDraft(req.user.id, dto);
    return {
      id: issue.id,
      status: issue.status,
      createdAt: issue.createdAt,
    };
  }
}
```

#### 步驟 7.5.3 — `IssuesService`

`apps/api/src/issues/issues.service.ts`：

```ts
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RepoSettingsService } from '../repo-settings/repo-settings.service';

@Injectable()
export class IssuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repoSettings: RepoSettingsService,
  ) {}

  async createDraft(
    authorId: string,
    dto: { repoOwner: string; repoName: string; title: string; bodyMarkdown: string },
  ) {
    // 1. Check repo is allowed to accept submissions
    const settings = await this.repoSettings.find(dto.repoOwner, dto.repoName);
    if (settings && !settings.canSubmitIssue) {
      throw new ForbiddenException('該 repo 暫不接受投稿');
    }
    // 若 settings 為 null（fetcher 尚未 upsert），預設放行（見 Open Q 4-6-2）

    // 2. Rate limit: 同一 user 每分鐘 <= 3 筆 pending
    const recentCount = await this.prisma.issue.count({
      where: {
        authorId,
        createdAt: { gte: new Date(Date.now() - 60_000) },
      },
    });
    if (recentCount >= 3) {
      throw new HttpException('送出太頻繁，請稍後', HttpStatus.TOO_MANY_REQUESTS);
    }

    return this.prisma.issue.create({
      data: {
        authorId,
        repoOwner: dto.repoOwner,
        repoName: dto.repoName,
        title: dto.title,
        bodyMarkdown: dto.bodyMarkdown,
        status: 'pending',
      },
    });
  }

  listMine(authorId: string) {
    return this.prisma.issue.findMany({
      where: { authorId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
```

#### 步驟 7.5.4 — `MeController`

`apps/api/src/me/me.controller.ts`：

```ts
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { IssuesService } from '../issues/issues.service';

@Controller('me')
@UseGuards(AuthenticatedGuard)
export class MeController {
  constructor(private readonly issuesService: IssuesService) {}

  @Get()
  me(@Req() req: any) {
    const { id, email, displayName, avatarUrl, role } = req.user;
    return { id, email, displayName, avatarUrl, role };
  }

  @Get('issues')
  myIssues(@Req() req: any) {
    return this.issuesService.listMine(req.user.id);
  }
}
```

### 7.6 後端 `.env` 與 `.env.example`

`apps/api/.env.example`：

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/zenbu_milestones

# Google OAuth (see Google Cloud Console)
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_CALLBACK_URL=http://localhost:4000/api/auth/google/callback

# Session
SESSION_SECRET=  # generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# GitHub (M4 starts using this)
ZENBU_ORG_WRITE_TOKEN=

# Bunny CDN (V2; leave empty in M1)
BUNNY_CDN_URL=
BUNNY_STORAGE_HOST=
BUNNY_STORAGE_ZONE=
BUNNY_STORAGE_PASSWORD=

# Frontend origin (for CORS + OAuth redirect)
WEB_ORIGIN=http://localhost:5173

# Admin bootstrap
INITIAL_ADMIN_EMAILS=

# Internal token (fetcher → /api/internal/*)
INTERNAL_API_TOKEN=

# Server
PORT=4000
NODE_ENV=development
```

**加入 `apps/api/.gitignore`**（建立若無）：`.env`、`dist/`、`*.log`。

### 7.7 前端 Vite 在 Monorepo 的調整

#### 步驟 7.7.1 — `apps/web/vite.config.ts` 維持原樣（base 不變）

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/zenbu-milestones/',
  build: { outDir: 'dist', sourcemap: false },
  server: { port: 5173 },
});
```

#### 步驟 7.7.2 — `apps/web/.env.example`

```env
VITE_API_BASE_URL=http://localhost:4000
```

正式環境用 GitHub Actions secret 注入 build-time：

- `.github/workflows/build-and-deploy.yml` 的 `vite build` step 前加 `env: VITE_API_BASE_URL: ${{ secrets.VITE_API_BASE_URL }}`

#### 步驟 7.7.3 — 前端 graceful degrade

`apps/web/src/data/api.ts`：

```ts
const API_BASE = import.meta.env.VITE_API_BASE_URL;

export const isApiAvailable = () => Boolean(API_BASE);

export const apiFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
  if (!isApiAvailable()) {
    throw new Error('[api] VITE_API_BASE_URL 未設定，此功能暫不可用');
  }
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`[api] ${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
};
```

M1 階段 `VITE_API_BASE_URL` **尚未**注入 GitHub Pages build，所以正式站點的 `isApiAvailable()` 回 `false`，所有寫入 UI（M2 之後）都會安全地隱藏，既有唯讀 SPA 完全不受影響。

### 7.8 同時跑 web + api 本地開發

**選項 A — 兩個 terminal**（最簡單）：

```bash
# terminal 1
pnpm --filter web dev

# terminal 2
pnpm --filter api start:dev
```

**選項 B — 一行指令（推薦）**：

```bash
pnpm dev:all   # pnpm -r --parallel run dev (root script)
```

**選項 C — 導入 Turborepo**：M1 時**暫不導入**，理由：`pnpm -r` 足以滿足 V1；Turborepo 的 cache 收益在多 package 反覆 build 時才明顯。M4 或 M5 之後再評估。

### 7.9 CI workflow 調整

`.github/workflows/build-and-deploy.yml`：

```diff
- run: pnpm install --frozen-lockfile
- run: pnpm run fetch-data
- run: pnpm run build
+ run: pnpm install --frozen-lockfile
+ run: pnpm --filter web run fetch-data
+ env:
+   GH_TOKEN: ${{ secrets.ZENBU_ORG_READ_TOKEN }}
+ run: pnpm --filter web run build
+ env:
+   VITE_API_BASE_URL: ${{ secrets.VITE_API_BASE_URL }}
```

Artifact path 從 `dist/` 改為 `apps/web/dist/`。

**API 部署**：M1 不做 CI（手動 `railway up`）；M4 再加 `.github/workflows/deploy-api.yml`。

### 7.10 手動驗證流程（M1 DoD）

```bash
# 1. DB 開起來（docker-compose or Railway local tunnel）
# 2. apps/api/.env 填好所有 value
cd apps/api
pnpm exec prisma migrate dev
pnpm start:dev
# ✓ http://localhost:4000/api/health → 200

# 3. 前端
cd ../..
pnpm --filter web dev
# ✓ http://localhost:5173/zenbu-milestones/ 仍能正常顯示

# 4. OAuth flow
# 瀏覽器訪問 http://localhost:4000/api/auth/google
# → 跳 Google → 同意 → 回到 http://localhost:5173
# → 檢查 DB users 表有新增一筆
# → 檢查 INITIAL_ADMIN_EMAILS 內的帳號 role=admin

# 5. 用 cookie 打 POST /api/issues
curl -X POST http://localhost:4000/api/issues \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"repoOwner":"zenbuapps","repoName":"wp-power-course","title":"測試","bodyMarkdown":"內容"}'
# ✓ 回 {"id":"...","status":"pending","createdAt":"..."}

# 6. curl GET /api/me/issues
curl http://localhost:4000/api/me/issues -b cookies.txt
# ✓ 回 [ {上一步的 issue...} ]

# 7. 未登入打
curl -X POST http://localhost:4000/api/issues -d '{}'
# ✓ 回 401
```

---

## 8. 資料流分析

### 8.1 訪客送出 issue → DB pending

```
[Browser]           [NestJS API]                    [PostgreSQL]
   │                     │                               │
   │ POST /api/issues    │                               │
   ├────────────────────▶│                               │
   │ (cookie, body)      │ AuthenticatedGuard            │
   │                     │ ├─ cookie 有效?                │
   │                     │ ▼                             │
   │                     │ ValidationPipe                │
   │                     │ ├─ title ≤256?                │
   │                     │ ├─ owner/name regex 合法?      │
   │                     │ ▼                             │
   │                     │ RepoSettings.find             │
   │                     │ ├─ canSubmit=true?            │
   │                     │ ▼                             │
   │                     │ Rate limit check              │
   │                     │ ├─ <3 筆/60s?                 │
   │                     │ ▼                             │
   │                     │ prisma.issue.create ─────────▶│
   │                     │                               │
   │                     │◀── uuid, createdAt ───────────┤
   │◀── 201 { id, ... } ─┤                               │
```

**Shadow paths**：

| 節點 | Nil | Empty | Error | Stale |
|------|-----|-------|-------|-------|
| AuthenticatedGuard | cookie 缺 → 401 | cookie 空 → 401 | session store 壞 → 500 | session 過期 → 401（使用者再登入）|
| ValidationPipe | `title=null` → 400 | `title=''` → 400 | decorator error → 500 | — |
| RepoSettings | repo 不存在於 DB（尚未 upsert）→ 視為放行 | `canSubmit=false` → 403 | DB 連線斷 → 500 + 自動重連 | fetcher 尚未 upsert → 預設 `true` 放行（見 Open Q 4-6-2）|
| Rate limit | — | — | DB 慢查 → 500 | 並發下可能放行第 4 筆（可接受，非安全關鍵）|
| prisma.create | DB down → 500 | — | unique constraint（不會有）→ 500 | 寫成功但 response 丟失 → 使用者重送變成 2 筆（M2 前端加冪等 token 或 UI disable）|

### 8.2 管理員審核通過 → 代呼 GitHub API

```
[Admin UI]          [NestJS API]               [GitHub API]        [PostgreSQL]
   │                     │                          │                    │
   │ POST /api/admin/issues/:id/approve             │                    │
   ├────────────────────▶│                          │                    │
   │                     │ AdminGuard               │                    │
   │                     │ ├─ role=admin?           │                    │
   │                     │ ▼                        │                    │
   │                     │ prisma.issue.findUnique ─│───────────────────▶│
   │                     │                          │                    │
   │                     │ ├─ exists?                                    │
   │                     │ ├─ status=pending?                            │
   │                     │ ▼                        │                    │
   │                     │ github.issues.create ───▶│ POST /repos/.../issues
   │                     │                          │                    │
   │                     │ ├─ 201?                                       │
   │                     │ ├─ 422? (schema error)                        │
   │                     │ ├─ 403? (rate limit)                          │
   │                     │ ├─ 401? (PAT expired)                         │
   │                     │ ▼                        │                    │
   │                     │ prisma.issue.update ─────│───────────────────▶│
   │                     │ status=synced-to-github  │                    │
   │                     │                          │                    │
   │                     │ prisma.auditLog.create ──│───────────────────▶│
   │◀── 200 { issue } ───┤                          │                    │
```

**Shadow paths**：

| 節點 | Nil | Error | Concurrency |
|------|-----|-------|-------------|
| findUnique | id 不存在 → 404 | DB down → 500 | 兩 admin 同時審核 → 第二次看到 status≠pending → 409 Conflict |
| status check | status=approved/rejected/synced → 409 | — | — |
| github.issues.create | — | 401 PAT → 503 + alert；422 schema → 500；timeout → retry 1 次；網路錯 → 500 | rate limit → 503 + Retry-After |
| issue.update | DB 寫失敗 | — | **關鍵**：GitHub 已建但 DB 寫失敗 → 人工修復 or 下一輪 fetcher 對齊（fetcher 發現 GitHub 上有該 issue number 時 upsert DB）|
| auditLog | — | 寫失敗 log error 但不阻擋主流程 | — |

**原子性策略**：

1. **先 GitHub 再 DB**：避免 GitHub 建了但 DB 沒寫（比反過來好，因為下輪 fetcher 會重新把 GitHub 的真實資料同步回 DB，狀態最終一致）
2. DB 寫失敗時的補償：回 200 給 admin（GitHub 已成功）但 log error 到 `audit_logs.action='issue.approve.db_mismatch'`
3. 長期解法：引入 outbox pattern 或 event sourcing（V3+，V1 不做）

### 8.3 訪客看「我的 issue 列表」

```
[Browser]                [NestJS API]              [PostgreSQL]
   │                          │                         │
   │ GET /api/me/issues       │                         │
   ├─────────────────────────▶│                         │
   │                          │ AuthenticatedGuard      │
   │                          │ ▼                       │
   │                          │ prisma.issue.findMany ─▶│
   │                          │ where: { authorId }     │
   │                          │ orderBy: createdAt desc │
   │                          │ take: 100               │
   │                          │◀───── Issue[] ──────────┤
   │◀── 200 [ ... ] ──────────┤                         │
```

**Shadow paths**：

| 節點 | Nil | Empty |
|------|-----|-------|
| findMany | userId 無效 → 401（認證層先擋）| 新使用者沒發過 → `[]` → 前端顯示 empty state |

### 8.4 Fetcher 每輪 upsert `repo_settings`

```
[GH Actions cron]   [fetcher]             [GitHub]          [NestJS internal]       [PG]
    │                   │                     │                    │                   │
    │ every hour        │                     │                    │                   │
    ├──────────────────▶│                     │                    │                   │
    │                   │ list zenbuapps repos│                    │                   │
    │                   ├────────────────────▶│                    │                   │
    │                   │◀── Repo[] ──────────┤                    │                   │
    │                   │                     │                    │                   │
    │                   │ filter !archived, !fork                  │                   │
    │                   │                     │                    │                   │
    │                   │ POST /api/internal/repo-settings/upsert  │                   │
    │                   │ header: x-internal-token                 │                   │
    │                   ├─────────────────────────────────────────▶│                   │
    │                   │                     │                    │ validate token    │
    │                   │                     │                    │ ▼                 │
    │                   │                     │                    │ upsert each repo ▶│
    │                   │                     │                    │   onConflict=DO NOTHING on insert
    │                   │                     │                    │   on update=(no-op, don't override admin's toggle)
    │                   │◀── { upserted: N } ─┤                    │                   │
    │                   │                     │                    │                   │
    │                   │ write JSON files                          │                   │
    │                   │ (to apps/web/public/data/)                │                   │
```

**關鍵決策**：**upsert 時只 insert，不 update**。理由：admin 可能已手動將某 repo 改成 `canSubmitIssue=false`，下輪 fetcher 不應蓋掉。Prisma 寫法：

```ts
await prisma.repoSettings.upsert({
  where: { repoOwner_repoName: { repoOwner, repoName } },
  create: { repoOwner, repoName, canSubmitIssue: true, visibleOnUI: !isArchived },
  update: {}, // intentionally empty: 不覆蓋 admin 的手動設定
});
```

**例外**：如果 repo 從 non-archived 變成 archived，fetcher 應主動把 `visibleOnUI=false` 更新（這是系統自動判定，admin 無從提前設置）。實作時用兩階段：先 `findUnique` → 若紀錄存在且當前 archived 狀態不符、則 targeted `update`；若紀錄不存在則 `create`。

**Shadow paths**：

| 節點 | Nil | Error |
|------|-----|-------|
| list repos | org 不存在 → fetcher 整個失敗 + CI alert | rate limit → 等下一小時 |
| POST /api/internal | API down → fetcher 略過此步繼續寫 JSON（唯讀路徑仍可用）| 413 Payload too large（不太可能，repo 數 <100）→ log |
| upsert | — | unique violation（不會，見 `@@unique`）|

---

## 9. 錯誤處理登記表

| 方法/路徑 | 可能失敗原因 | 錯誤類型 | 處理方式 | 使用者可見? |
|-----------|--------------|----------|----------|-------------|
| `POST /api/auth/google` | Google 服務異常 | 502 | passport fallback → 顯示「登入服務暫時無法使用」 | 是 |
| OAuth callback | email 缺失 | 400 | log + 回首頁帶 `?auth_error=no_email` | 是 |
| OAuth callback | DB upsert 失敗 | 500 | log + 回首頁帶 `?auth_error=system` | 是（通用訊息）|
| `POST /api/issues` | 未登入 | 401 | 回 `{error:'unauthenticated'}` + 前端觸發登入流程 | 是 |
| `POST /api/issues` | DTO 驗證失敗 | 400 | class-validator 自動回 `{error, message[]}` | 是（欄位級錯誤）|
| `POST /api/issues` | `canSubmitIssue=false` | 403 | 前端顯示「該 repo 暫不接受投稿」 | 是 |
| `POST /api/issues` | rate limit（>3/min）| 429 | 前端顯示「送出太頻繁，請 60 秒後再試」 | 是 |
| `POST /api/issues` | DB 寫失敗 | 500 | log + 通用錯誤；前端保留表單內容不清空 | 是（通用訊息）|
| `GET /api/me/issues` | 未登入 | 401 | 前端 redirect 到登入 | 是 |
| `GET /api/me/issues` | DB 讀失敗 | 500 | log + retry 1 次；前端顯示「讀取失敗，稍後重試」 | 是 |
| `POST /api/admin/issues/:id/approve` | 非 admin | 403 | 前端 redirect 首頁 + 提示 | 是 |
| `POST /api/admin/issues/:id/approve` | issue 不存在 | 404 | 前端顯示「issue 已被其他 admin 處理或刪除」 | 是 |
| `POST /api/admin/issues/:id/approve` | status≠pending | 409 | 前端顯示「已被其他 admin 審核，請重新整理」 | 是 |
| `POST /api/admin/issues/:id/approve` | GitHub API 401（PAT 失效）| 503 | log critical + alert；前端顯示「系統設定異常，請聯絡管理員」 | 是 |
| `POST /api/admin/issues/:id/approve` | GitHub API 422 | 500 | log + 前端顯示 GitHub 回傳訊息 | 是 |
| `POST /api/admin/issues/:id/approve` | GitHub API rate limit | 503 + Retry-After | 前端顯示「GitHub API 繁忙，請 5 分鐘後重試」 | 是 |
| `POST /api/admin/issues/:id/approve` | GitHub 成功但 DB 寫失敗 | 200（給 admin）+ log | 記 audit log `action='issue.approve.db_mismatch'`；下輪 fetcher 對齊 | 否（系統自行處理）|
| `PATCH /api/admin/users/:id/role` | 改自己 | 403 | 前端按鈕在自己的列 disabled；後端 double-check | 是 |
| `PATCH /api/admin/users/:id/role` | 撤銷最後一位 admin | 409 | 後端 transaction 內 `COUNT(role='admin')=1` 拒絕 | 是 |
| `PATCH /api/admin/repos/:owner/:name/settings` | repo 不存在於 `repo_settings` | 404 | fallback：於同一請求中 insert（admin 可能想搶在 fetcher 之前設定）| — |
| fetcher → `POST /api/internal/...` | internal token 錯 | 401 | log + fetcher 繼續寫 JSON（不阻擋）| 否 |
| fetcher `list repos` | rate limit | — | CI log + 等下一小時；不 alert（自動恢復）| 否 |
| fetcher `list repos` | 401 `ZENBU_ORG_READ_TOKEN` | fail job | GHA alert email | 否（管理員收到）|

**CRITICAL GAPs 檢查**：

- ✅ 所有「處理方式=無 + 使用者可見=靜默」都已列出處理
- ⚠️ 一個邊界情境：**GitHub 成功但 DB 寫失敗**，目前靠下輪 fetcher 對齊。M4 實作時須寫單元測試驗證 fetcher 能處理「GitHub 有 issue X 但 DB 無對應記錄」的 reconciliation 邏輯（在 fetcher 側做 backfill）——V1 不引入測試框架，此條作為 V2 的必做項目

---

## 10. 失敗模式登記表

| 程式碼路徑 | 失敗模式 | 已處理? | 有測試? | 使用者可見? | 恢復路徑 |
|-----------|----------|---------|---------|-------------|---------|
| `AuthenticatedGuard` | session store（memory）重啟後清空 | ⚠️ 部分 | ❌ | 是（被迫重登） | V1 接受；V2 換 Redis session store |
| `GoogleStrategy.validate` | `profile.emails` 為空陣列 | ✅ | ❌ | 是（`?auth_error=no_email`）| 使用者換 Google 帳號登入 |
| `IssuesService.createDraft` | 並發 3+ 請求繞過 rate limit | ⚠️ 部分（非 serializable）| ❌ | 是（部分放行） | 可接受（rate limit 非 security-critical）|
| `IssuesService.createDraft` | 前端斷線中重試導致重複 submit | ❌ 未處理 | ❌ | 是（重複 issue）| M2 前端加冪等 token（header `Idempotency-Key: uuid`）|
| `AdminGuard` | 使用者 role 剛被降權但 session 尚有 cache | ⚠️ | ❌ | 是（被降權後仍可操作一段時間）| deserializer 每次請求都查 DB（已是現狀）|
| `GitHubService.createIssue` | 網路 timeout（>30s）| ✅ 有 retry 1 次 | ❌ | 是（第二次超時才顯示錯）| retry 失敗 → 回錯誤讓 admin 重試 |
| `GitHubService.createIssue` | PAT 權限臨時被收回 | ✅ log + alert | ❌ | 是（「系統設定異常」）| 管理員 rotate PAT |
| `prisma.issue.update` | GitHub 成功後 DB 寫失敗 | ⚠️ 靠 fetcher reconcile | ❌ | 否 | 下輪 fetcher 對齊（M4 須寫 reconciliation）|
| `RepoSettingsService.find` | repo 還沒被 fetcher upsert 過 | ⚠️ 預設放行（`canSubmit=true`）| ❌ | 否 | 第一次 fetcher 跑完後同步 |
| fetcher `listRepos` | org 完全抓不到 | ✅ fail fast | N/A | 否（CI 失敗）| 人工檢查 PAT |
| fetcher `listRepos` | 部分 repo 成功、部分失敗 | ⚠️ 現況 throw | N/A | 否 | 下輪自動重試 |
| 前端 `apiFetch` | CORS 被擋 | ⚠️ 顯示通用錯 | ❌ | 是 | 檢查後端 `WEB_ORIGIN` 設定 |
| 前端 `apiFetch` | API 500 但 response body 不是 JSON | ✅ try/catch | ❌ | 是 | 顯示通用「伺服器異常」|
| 前端 `IssueSubmitForm` | 使用者填到一半切頁籤 | ❌ 未處理 | ❌ | 是（內容遺失）| V2 加 localStorage draft autosave |
| 前端 `MyIssuesPage` | list 回 100 筆但使用者有 200 筆 | ❌ 分頁未做 | ❌ | 是（看不到較舊的）| V2 加分頁 UI |

> 註：V1 不引入測試框架，故所有「有測試?」欄位為 ❌。V2 漸進導入 Vitest（見第 14 節）後補測試。

---

## 11. 風險登記表

| 等級 | 風險 | 影響範圍 | 緩解措施 |
|------|------|---------|---------|
| 高 | `BUNNY_STORAGE_PASSWORD` 已洩漏 | 附件儲存被竄改 / 流量盜用 | 前置作業第 1 項：立即 rotate；git 歷史 / Slack / Notion 清查 |
| 高 | `ZENBU_ORG_WRITE_TOKEN` 洩漏 | 任何人可用其代建 issue | 只放部署平台 env var；**絕不** commit；90 天輪替；token 出現在 log 時自動 mask |
| 高 | GitHub API rate limit（5000/hr per PAT） | 審核尖峰期卡住 | 分兩組 PAT（read / write 獨立）；審核前檢查 `X-RateLimit-Remaining<100` 拒絕；M4 加 exponential backoff |
| 高 | OAuth CSRF（回 callback 時 state 被偽造） | 帳號綁架 | `passport-google-oauth20` 內建 `state` check；額外驗證 `state` 與 session 一致 |
| 中 | 前端 CORS 與後端 cookie 跨域 | 登入 flow 斷裂 | 後端明確設 `credentials: true` + `origin: [WEB_ORIGIN]`；前端 `fetch` 帶 `credentials: 'include'`；正式 WEB_ORIGIN 必須走 HTTPS |
| 中 | 「最後一位 admin 被撤銷」race condition | 系統鎖死 | DB transaction + `COUNT(role='admin')=1` 拒絕；M4 用 SERIALIZABLE isolation |
| 中 | fetcher vs runtime 資料延遲 | UI 顯示的 issue 與 DB 不同步（最多 1 小時）| 接受；V2 加 webhook 即時同步 |
| 中 | Session store 記憶體型（express-session 預設 MemoryStore） | 後端重啟後所有使用者被登出 | V1 接受；V2 換 Redis / Postgres session store（`connect-pg-simple`） |
| 中 | Prisma migration 衝突 | 正式 DB schema drift | 每次 schema 變更走 `migrate dev` 產生 SQL；正式用 `migrate deploy`；schema 衝突時 Railway shell 手動 resolve |
| 中 | Monorepo 遷移失敗 | 既有 CI / Pages 部署壞掉 | M1 的 feature branch 充分測試 `build-and-deploy.yml` 後再 merge；rollback = revert commit |
| 中 | markdown 預覽 XSS | 任意 JS 執行 | `rehype-sanitize` + 預覽 html 不含 `<script>`；後端存純 markdown，不做 HTML 轉換 |
| 中 | `INITIAL_ADMIN_EMAILS` 拼錯 | 首位 admin 無法 bootstrap | 部署前 echo 一次 env var 驗證；M4 前先 SQL 手動改 |
| 中 | PAT 90 天到期 | 代轉 GitHub 全部失敗 | GitHub Actions 設 schedule，到期前 14 天發通知 issue；M4 加 health check endpoint 每日驗證 token |
| 低 | GitHub Pages `base` path 改名（重構時）| 靜態資源 404 | 現況三處同步（已在 `vite-base-path.rule.md` 規範）|
| 低 | Railway 免費額度用完 | 後端不可用 | 設定帳單告警；若超量則遷至 Fly.io + Neon |
| 低 | Google OAuth client 未驗證狀態 | 顯示「未驗證 app」警告 | V1 接受（使用者群為 zenbuapps 相關）；V2 提交 Google 驗證 |
| 低 | OAuth callback URL 設錯 | 登入後白屏 | M1 前置作業第 3 項雙 URL 列清單；deploy 前用 curl test |

---

## 12. Open Questions 拍板紀錄

全部採納 `prompt.md` 第十節建議欄：

| # | 主題 | 拍板 |
|---|------|------|
| 2-1 | 撤銷最後一位 admin 是否允許 | **禁止**（DB transaction 內 count 後拒絕）|
| 4-3-1 | 訪客能否看 repo issue 列表 | **能看** public GitHub issue；pending 草稿僅作者可見 |
| 4-5-1 | V1 審核介面完整度 | **B：最小 admin 頁**（三分頁）|
| 4-6-1 | archived / private repo 預設 | archived `visibleOnUI=false` 預設；private 不納入 DB |
| 4-6-2 | 新 repo 首次 `repo_settings` 初始化 | fetcher 每輪 upsert（insert only，**不覆蓋** admin 設定；但 archived 狀態會主動同步 `visibleOnUI`）|
| 5-1 | 轉送時加來源 label `via-zenbu-milestones` | **加**（M4 實作時，若該 label 不存在先自動 `POST /repos/.../labels` 建立一次） |
| 6-1 | DB 技術棧 | **PostgreSQL** |
| 6-2 | 專案結構 | **Monorepo（pnpm workspaces）**，`apps/web` + `apps/api` + `packages/shared` |
| 6-3 | 後端部署位置 | **Railway**（ADR-002）|
| 6-4 | repo issue 列表資料來源 | **fetcher JSON**（減少 runtime GitHub 打擊）|
| 7-1 | 附件策略 V1 | **V1 不做**；Spike 結論先產出（M5），V2 走 Bunny CDN |
| 10-1 | 審核通知機制 | **V2 再做**（M1–M6 均不實作）|
| 10-2 | Markdown 編輯器 | **@uiw/react-md-editor**（ADR-003）|

---

## 13. 依賴關係圖

```mermaid
flowchart LR
  PRE["前置作業<br/>(PAT / OAuth / DB)"]
  M1["M1: OAuth + DB +<br/>提交 API"]
  M2["M2: 前端表單<br/>+ Markdown 編輯器"]
  M3["M3: 我的 issue<br/>管理頁"]
  M4["M4: 管理員後台<br/>+ GitHub 轉送"]
  M5["M5: 附件<br/>(V2 + Spike)"]
  M6["M6: Issue 列表<br/>搜尋 / Filter"]

  PRE --> M1
  M1 --> M2
  M1 --> M3
  M1 --> M4
  M1 -.->|schema only| M5
  M1 --> M6
  M2 --> M3
  M3 --> M4
  M4 -.->|V2| M5

  classDef v1 fill:#dbeafe,stroke:#2563eb
  classDef v2 fill:#f3f4f6,stroke:#9ca3af,stroke-dasharray:5 5
  class M1,M2,M3,M4,M6 v1
  class M5 v2
```

**關鍵鏈**：

- **首要鏈**（最短可交付閉環）：PRE → M1 → M2 → M3 = 使用者能登入、提交、查詢自己的 issue
- **管理員鏈**：PRE → M1 → M3 → M4 = 管理員能審核 + 代轉 GitHub
- **可延後**：M5（V2）、M6（可在 M4 之後）

---

## 14. 測試策略

### V1 策略：不引入測試框架

**理由**：

- 既有專案無測試（`CLAUDE.md` 明示「沒有測試框架」）
- V1 目標是快速驗證架構翻轉可行性，引入 Vitest / Jest / Playwright 會把 Monorepo 初始化工作量翻倍
- 手動 QA 覆蓋 happy path；前置作業 checklist 完成後，M1–M4 每個 Milestone 都有明確的 curl / 瀏覽器驗證步驟

**替代方案**：

- M1–M4 每個 PR 附「手動驗證清單」截圖
- 在 `apps/api` 導入 `class-validator`，讓 DTO 層級的 input validation 由 library 保證
- Prisma schema 自帶型別保證，減少 service 層錯誤
- `tsc -b` 在整個 monorepo 依然是強制關卡

### V2 漸進導入路線（planner 建議）

| 階段 | 工具 | 對象 | 投入成本 |
|------|------|------|---------|
| V2.1 | Vitest | `apps/api/src/**/*.service.ts` 單元測試 | 每個 service 1-2 天 |
| V2.2 | `@nestjs/testing` + Prisma in-memory | controller 整合測試 | 每個 controller 1 天 |
| V2.3 | Playwright | `apps/web` E2E 關鍵 happy path（登入 → 提交 → 審核）| 3-5 天初始化 |
| V2.4 | `msw` | `apps/web` 元件測試（mock API） | 每個頁面 0.5-1 天 |

**V2 進場門檻**：使用者數 > 50 人 OR M1–M6 全部上線 3 個月 OR 出現第 3 次 regression bug

### 關鍵邊界情況（V1 手動驗證清單）

- [ ] 未登入打 `POST /api/issues` 回 401
- [ ] 登入後連按 4 次送出：第 4 次回 429
- [ ] `canSubmitIssue=false` 的 repo，API 回 403
- [ ] OAuth callback 時若 Google 拒絕（使用者按取消），回首頁無 500
- [ ] 使用者 A 提交的 issue，使用者 B 看不到（`GET /api/me/issues` 隔離）
- [ ] Admin 審核通過 → GitHub 上確實看到 issue + `via-zenbu-milestones` label
- [ ] 同一 issue 被兩個 admin 同時點「通過」→ 第二位回 409
- [ ] 最後一位 admin 撤銷自己 → 回 409
- [ ] fetcher 跑完後，`repo_settings` 表出現新 repo 紀錄
- [ ] Admin 改了 `canSubmitIssue=false`，下輪 fetcher **不** 覆寫回 true
- [ ] Archived repo → fetcher 自動把 `visibleOnUI=false`

---

## 15. 與既有專案契約的差異

### 15.1 會動到的既有檔案

| 檔案 | 變更 | 對應 rule |
|------|------|-----------|
| `src/data/types.ts` → `apps/web/src/data/types.ts` | M6 新增 `RepoDetail.allIssues`（見 6.M6 檔案表） | `data-contract.rule.md` §1：三端同步 |
| `scripts/fetch-data.ts` → `apps/web/scripts/fetch-data.ts` | M6 擴充：抓全 repo issue；M4 新增：POST 到後端 upsert `repo_settings` | `data-contract.rule.md` §6（排序規則）需保留 |
| `vite.config.ts` → `apps/web/vite.config.ts` | `base` 不動；新增 `envPrefix: 'VITE_'` 如需 | `vite-base-path.rule.md` §1 |
| `.github/workflows/build-and-deploy.yml` | paths 改 `apps/web/dist/`；pnpm filter 命令 | `pnpm-and-ci.rule.md` §3 |
| `index.html` → `apps/web/index.html` | 不動內容，僅搬位置 | `vite-base-path.rule.md` §2 |
| `package.json`（root） | 改 workspace root | `pnpm-and-ci.rule.md` §1 |
| `tsconfig*.json` | 搬到 `apps/web/`；`packages/shared` 自己的 tsconfig | — |
| `.gitignore` | 加 `apps/api/.env`、`apps/api/dist/`、`apps/api/node_modules/` | — |

### 15.2 新增檔案（僅列關鍵）

- `apps/api/` 完整 NestJS 專案（見 7.2）
- `apps/api/prisma/schema.prisma`（見 7.3）
- `apps/api/.env.example`
- `apps/web/src/data/api.ts`（M1+）
- `apps/web/src/hooks/useSession.ts`（M2）
- `apps/web/src/pages/MyIssuesPage.tsx`（M3）
- `apps/web/src/pages/AdminPage.tsx`（M4）
- `packages/shared/src/index.ts` — 共用 enum：`IssueStatus`, `UserRole`, `AttachmentKind`

### 15.3 不會改的既有契約

- 既有 JSON 檔的形狀（`summary.json` / `repos.json` / `repos/{name}.json`）—— M6 擴充 `RepoDetail.allIssues` 時採增量加欄位，向後相容
- `HashRouter`（繼續用，GitHub Pages 限制不變）
- `.claude/rules/styling-system.rule.md` 的所有規範（新 UI 一律遵守）
- `SENSITIVE_LABELS` 過濾（fetcher 保持）

### 15.4 三端同步檢查（資料契約 rule §1）

M6 為 `RepoDetail` 新增 `allIssues: IssueLite[]` 時，必須同步：

1. `apps/web/src/data/types.ts` — 加欄位 + inline comment
2. `apps/web/scripts/fetch-data.ts` — `buildRepoDetail` 產出處填值
3. 消費端（`RoadmapPage`、`RepoIssueList`）— 讀取並 render
4. `pnpm --filter web typecheck` 綠燈

---

## 16. 成功標準（DoD）

### M1 DoD

- [ ] `pnpm install` 在 root 成功
- [ ] `pnpm --filter web dev` 開得起（既有 SPA 無迴歸）
- [ ] `pnpm --filter api start:dev` 開得起，`/api/health` 回 200
- [ ] `apps/api/prisma/migrations/` 有 initial migration commit
- [ ] Google OAuth flow 完整走通（登入 → callback → users 表寫入）
- [ ] `INITIAL_ADMIN_EMAILS` 內帳號首登時 role=admin
- [ ] `POST /api/issues` 寫 DB 成功（status=pending）
- [ ] `GET /api/me/issues` 回自己的 issue
- [ ] 未登入 `POST /api/issues` 回 401
- [ ] `canSubmitIssue=false` 的 repo 回 403
- [ ] rate limit >3/min 回 429
- [ ] 既有 CI `build-and-deploy.yml` 繼續綠燈

### M2 DoD

- [ ] RoadmapPage 出現「提出 issue」按鈕
- [ ] 點擊開啟 Modal（桌）/ Drawer（手機）
- [ ] `@uiw/react-md-editor` 預覽即時更新
- [ ] 送出成功 → 顯示「草稿已送出」+ 關閉 dialog
- [ ] 未登入點按鈕 → 顯示登入 CTA
- [ ] 表單所有 shadow paths 手動測過（401 / 403 / 429 / 500）

### M3 DoD

- [ ] `/#/me/issues` 路由存在
- [ ] 列自己的 issue（排序 + 狀態徽章 + GitHub 連結）
- [ ] 空狀態 UI 正確
- [ ] 未登入訪問被 redirect

### M4 DoD

- [ ] `/#/admin` 三分頁 UI 可操作
- [ ] 審核通過 → GitHub 上真的出現 issue + `via-zenbu-milestones` label
- [ ] DB 狀態同步為 `synced-to-github`，`githubIssueNumber` 有值
- [ ] repo 設定 toggle 即時生效
- [ ] 使用者權限變更即時寫 `audit_logs`
- [ ] 所有「不能改自己」「最後一位 admin」「409 concurrent」邊界測過
- [ ] 非 admin 打 `/api/admin/*` 回 403

### M5 DoD（V1）

- [ ] `specs/visitor-issue-submission/spike-attachments.md` 產出
- [ ] `issue_attachments` 表存在但無寫入邏輯
- [ ] V2 實作框架文件化（在 spike 結論附建議方案）

### M6 DoD

- [ ] RoadmapPage 有完整 issue 列表
- [ ] 5 種 filter 可組合
- [ ] Filter 狀態同步 URL query string
- [ ] 訪客能看 public issue；pending 草稿僅作者可見
- [ ] fetcher 擴充成功抓全 repo issue
- [ ] 三端同步（`types.ts` / fetcher / 消費端）typecheck 通過

---

## 17. 限制條件（Not In Scope）

V1 **不做**：

- 附件實際上傳（僅 spike）
- 影片附件
- Email / in-app 通知
- 前端測試（Vitest / Playwright）
- 後端 unit / integration 測試
- 分頁 UI（`GET /api/me/issues` 限 100 筆硬上限）
- 草稿自動儲存（localStorage）
- 多語言（僅 zh-Hant）
- Dark mode（既有站點亦無）
- 2FA（僅 Google OAuth）
- issue 編輯（提交後不可改；拒絕後需重提）
- issue 評論
- issue 關閉 / 重開的 UI（由 GitHub 側管理）
- 審核工作流程（workflow 引擎）
- webhook 即時同步 GitHub → DB（靠 fetcher 每小時對齊）
- 檔案歷史記錄 / 還原

---

## 18. 預估複雜度

**整體專案**：**高**（架構翻轉 + 新增完整後端 stack + 部署平台接入）

**各 Milestone**：

| Milestone | 複雜度 | 預估工作量（人/天，熟練全端工程師）|
|-----------|--------|-------------------------------|
| 前置作業 | 低 | 0.5 天（但需人親自執行，不能自動化）|
| **M1** | **高** | **5-7 天** |
| M2 | 中 | 3-4 天 |
| M3 | 低 | 1-2 天 |
| M4 | 高 | 6-8 天 |
| M5（V1 Spike） | 低 | 1 天 |
| M6 | 中 | 3-4 天 |
| **合計 V1** | — | **19.5-26.5 天** |

### M1 工作量拆解

| 子項目 | 工作量 |
|--------|-------|
| Monorepo 初始化（7.1）| 1 天 |
| NestJS skeleton（7.2）| 0.5 天 |
| Prisma schema + migration（7.3） | 1 天 |
| Google OAuth（7.4）| 1.5 天 |
| `POST /api/issues` + `GET /api/me/issues`（7.5）| 1 天 |
| `.env.example` + 前端 API client（7.6-7.7）| 0.5 天 |
| 本地 dev workflow（7.8）| 0.5 天 |
| CI 調整（7.9）| 0.5 天 |
| 手動 QA + debug buffer | 1-1.5 天 |
| **小計** | **5-7 天** |

---

## 附錄 A — 命名慣例

- 路由：`/api/<resource>/<action>`，RESTful 動詞
- DTO 類名：`<Action><Resource>Dto`（例：`CreateIssueDto`）
- Service 方法：動詞 + 資源（`createDraft`, `listMine`, `approveIssue`）
- enum 值：snake_case（Prisma 預設）；TypeScript 使用端亦用 snake_case 避免轉換
- 前端路由：`/#/me/issues`、`/#/admin`、`/#/repo/:name`（維持 HashRouter 慣例）

## 附錄 B — 後端 secret 注入清單（M1–M4 全收錄）

| 變數 | M1 必需 | M4 必需 | 注入方式 |
|------|---------|---------|---------|
| `DATABASE_URL` | ✅ | ✅ | Railway env |
| `GOOGLE_OAUTH_CLIENT_ID` | ✅ | ✅ | Railway env |
| `GOOGLE_OAUTH_CLIENT_SECRET` | ✅ | ✅ | Railway env |
| `GOOGLE_OAUTH_CALLBACK_URL` | ✅ | ✅ | Railway env |
| `SESSION_SECRET` | ✅ | ✅ | Railway env |
| `WEB_ORIGIN` | ✅ | ✅ | Railway env（逗號分隔多 origin）|
| `INITIAL_ADMIN_EMAILS` | ✅ | — | Railway env |
| `ZENBU_ORG_WRITE_TOKEN` | — | ✅ | Railway env（M4 才用）|
| `BUNNY_STORAGE_PASSWORD` | — | — | V2 才用 |
| `BUNNY_CDN_URL` / `BUNNY_STORAGE_HOST` / `BUNNY_STORAGE_ZONE` | — | — | V2 才用 |
| `INTERNAL_API_TOKEN`（fetcher → API internal endpoint）| — | ✅ | Railway env + GitHub Actions secret（fetcher 端）|

## 附錄 C — 規劃階段警示訊號自我檢查

- ✅ 步驟 0「認識當前專案」已完成（讀 CLAUDE.md、types.ts、vite.config.ts、package.json、data/loader.ts、App.tsx、四條 rules）
- ✅ 步驟 1「重述需求」— §2
- ✅ 步驟 2「研究已知風險」— §11
- ✅ 步驟 3「審視缺口」— prompt.md 已把 Open Questions 集中列出，§12 全部拍板
- ✅ 步驟 4「澄清疑點」— 使用者說「全照建議」，無需再問（依 prompt 指示）
- ✅ 步驟 5「資料流 + 錯誤處理」— §8、§9、§10
- ✅ 步驟 6「建立計劃」— §6–§7
- ✅ ASCII 資料流圖（§8 共 4 張）、Mermaid 架構圖（§3）、dependency graph（§13）皆齊
- ✅ 錯誤處理登記表、失敗模式登記表、風險登記表皆齊
- ✅ 每個 Milestone 有明確檔案變更表 + DoD
- ✅ 成功標準可勾選
- ✅ 限制條件明確
- ✅ 範圍模式標記為 EXPANSION（greenfield feature），未無聲擴大

---

**計劃結束。建議下一步：交接 `@zenbu-powers:tdd-coordinator` 啟動 M1 實作。**
