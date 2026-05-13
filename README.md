# Zenbu Roadmaps

把 [`zenbuapps`](https://github.com/zenbuapps) GitHub 組織底下所有專案的 **Roadmap 進度**、**Issue 狀態**、**到期提醒** 集中到一張儀表板，並提供「投稿 Issue → 管理員審核 → 自動轉送至 GitHub」的協作工作流程。

> **目前狀態**：服務尚未部署至公開網址，仍在本地開發階段。前端部署平台與後端託管環境遷移計畫進行中。如需在自己的機器上跑起來體驗，請參閱 [CONTRIBUTE.md](./CONTRIBUTE.md)。

---

## 這個服務能解決什麼問題？

當組織底下有十幾個 GitHub repo、每個 repo 又各自有 milestone / roadmap issue 時，常見的痛點：

- **進度散落各處**：要逐一打開每個 repo 才知道哪些 milestone 快到期、哪些 issue 卡住
- **投稿流程不一致**：客戶或外部協作者想回報 bug，卻不知道該開哪個 repo，也沒 GitHub 帳號
- **品質失控**：放任所有人直接開 issue，會混進無關內容、敏感資訊、格式不一的描述

Zenbu Roadmaps 把這三件事一起解決：

| 痛點 | Zenbu Roadmaps 的做法 |
| --- | --- |
| 進度散落 | 一頁總覽全部 repo，圖表呈現「進行中 / 逾期 / 已完成」，點進去看單一 repo 的時間軸 |
| 投稿不一致 | 內建 Markdown 編輯器（含預設範本、附圖拖曳）；用 Google 帳號登入即可投稿，不需要 GitHub 帳號 |
| 品質失控 | 所有投稿先進入 `pending` 狀態，由管理員審核後才同步到 GitHub；可寫拒絕理由回覆 |

---

## 三種角色

### 一般使用者（已用 Google 登入）

- 瀏覽**所有專案總覽**：統計卡（活躍 repo 數、進行中 / 逾期 roadmap 數、open issue 數）+ 完成度長條圖 + 狀態分布甜甜圈圖 + 各 repo 卡片
- 進入**單一專案 Roadmap 頁**：時間軸視圖呈現所有 milestone 的到期日、完成度、狀態（進行中 / 逾期 / 已完成 / 未排程）
- **提出投稿 Issue**：在 Roadmap 頁按「提出 Issue」開啟 Markdown 編輯器，可輸入標題、內容（含預設範本），支援拖曳 / 貼上 / 上傳圖片附件
- **追蹤自己的投稿**：「我的 Issue」頁可看到所有自己投稿過的 issue，依狀態分組（待審核 / 已通過 / 已拒絕 / 已轉至 GitHub）

### 管理員（在 `INITIAL_ADMIN_EMAILS` 名單中的使用者）

擁有上述所有功能 + 後台 `/admin` 三分頁：

| 分頁 | 能做什麼 |
| --- | --- |
| **Issue 審核** | 列出所有投稿，依「待審核 / 已轉 GitHub / 已通過（未同步）/ 已拒絕」分頁；可逐筆「通過」或「拒絕」（拒絕時填寫理由） |
| **Repo 設定** | 控制每個 repo 是否在前台顯示（`visibleOnUI`）、是否開放投稿（`submittable`） |
| **使用者權限** | 管理使用者角色（提升 / 降為 admin） |

管理員另有一顆「重新整理資料」按鈕，可強制清除後端 cache 並重新從 GitHub 抓資料（10 秒 debounce 防呆）。

### 投稿者體驗的完整流程

```
┌─────────────────┐
│ 1. Google 登入   │
└────────┬────────┘
         ▼
┌────────────────────────────┐
│ 2. 在總覽找到目標 repo      │
└────────┬───────────────────┘
         ▼
┌────────────────────────────────┐
│ 3. 進 Roadmap 頁，按「提出 Issue」│
└────────┬───────────────────────┘
         ▼
┌────────────────────────────────────┐
│ 4. 寫標題 + 內文（Markdown，可附圖）│
└────────┬───────────────────────────┘
         ▼
┌─────────────────────────────────┐
│ 5. 送出 → 狀態 = pending         │
└────────┬────────────────────────┘
         ▼
┌─────────────────────────────────────┐
│ 6. 管理員在 /admin 看到，審核       │
└────────┬───────────────┬────────────┘
         │ 通過          │ 拒絕
         ▼               ▼
┌─────────────────┐  ┌────────────────────┐
│ 7a. 後端用 PAT   │  │ 7b. 寫拒絕理由      │
│   建 GitHub Issue│  │   投稿者收到回覆    │
│   狀態 = synced  │  │   狀態 = rejected   │
└─────────────────┘  └────────────────────┘
         ▼
┌─────────────────────────────────────┐
│ 8. 投稿者在「我的 Issue」看到結果    │
└─────────────────────────────────────┘
```

---

## 使用情境範例

### 情境一：客戶回報 UI 異常

> 一位產品試用客戶發現某個按鈕點不下去，他登入 Zenbu Roadmaps：
>
> 1. 在總覽找到對應的產品 repo（例如 `zenbu-cms`）
> 2. 進去看 Roadmap，確認這個問題還沒被列入 milestone
> 3. 按「提出 Issue」，貼上截圖、描述重現步驟
> 4. 送出後即進入 pending 佇列
>
> 管理員在 `/admin` 看到這筆投稿，確認是真實 bug 後按「通過」，後端用 fine-grained PAT 自動在 `zenbuapps/zenbu-cms` 建立 GitHub issue，並把 GitHub issue 編號記錄回投稿。
>
> 客戶之後回到「我的 Issue」頁，看到狀態已變成「已轉 GitHub #123」並有外連連結，可直接追蹤後續討論。

### 情境二：跨專案進度盤點

> 專案經理想知道本季度所有專案的 roadmap 進度：
>
> 1. 開總覽頁看 4 張統計卡：活躍 repo 數、進行中 roadmap 數、逾期 roadmap 數、open issue 數
> 2. 看完成度長條圖，找出進度落後的專案
> 3. 看狀態甜甜圈圖，掌握整體「進行中 / 逾期 / 已完成」比例
> 4. 點 repo 卡片進去看時間軸，了解具體哪個 milestone 卡住

### 情境三：避免敏感資訊外洩

> 某些 issue 帶有 `confidential` / `security` / `internal-only` label。Zenbu Roadmaps 的後端會自動過濾這些 issue 不讓前台看到（包含標題、內文、labels），但 milestone 的整體進度百分比仍以 GitHub 的真實數字為準。
>
> 結果：用戶能看到「這個 milestone 完成度 60%」這種總體狀態，但具體是哪些 sensitive issue 不會外洩。

---

## 開始使用

### 加入服務

本服務尚未部署至公開網址，目前仍在本地開發階段。當服務上線後：

- **登入方式**：使用任何 Google 帳號即可登入並瀏覽儀表板、提出投稿
- **管理員權限**：須由現任管理員將你的 email 加入後端 `INITIAL_ADMIN_EMAILS` 名單（首次登入時自動授予 `admin` 角色），或由現任管理員透過 `/admin` 後台「使用者權限」分頁手動提升

### 在自己的機器上跑

如果你想在本地端體驗服務、貢獻程式碼、或自架一份內部使用，請參閱 [CONTRIBUTE.md](./CONTRIBUTE.md)：

- 環境需求（Node.js / pnpm / PostgreSQL / GitHub PAT）
- 啟動指令（`pnpm dev:all`）
- 環境變數設定
- 本機 dev-login（不用真的跑 Google OAuth）

---

## 常見問題

**Q：未登入能看任何頁面嗎？**
A：不行。所有頁面（包含總覽）都需要 Google 登入後才能瀏覽，這是為了避免 `zenbuapps` 內部資訊外洩。

**Q：投稿要不要有 GitHub 帳號？**
A：不需要。投稿者只需 Google 登入即可。實際建立 GitHub issue 是由後端用 fine-grained PAT 代為執行（在管理員通過審核後）。

**Q：投稿被拒絕後可以重投嗎？**
A：可以。被拒絕的 issue 不會回到 pending；如需再投，重新提交即可。建議先看拒絕理由再修正內容。

**Q：管理員看得到我寫了什麼草稿嗎？**
A：投稿在送出**前**僅存在於你的瀏覽器；按下送出後，內容才會寫入後端 DB 並對管理員可見。請不要把純粹的記錄留在編輯器中、再離開頁面。

**Q：我的投稿何時會出現在 GitHub？**
A：管理員按下「通過」的那一刻起，後端會立即呼叫 GitHub API 建立 issue。若 GitHub 端因網路或 rate limit 暫時失敗，狀態會停在「已通過（未同步）」，管理員可重試。

**Q：資料多久更新一次？**
A：後端對 GitHub 資料設有 5 分鐘 in-memory cache。需要立即同步時，管理員可在 `/admin` 按「重新整理資料」強制清除 cache（10 秒 debounce）。

---

## 透過 MCP / Claude Code 操作

如果你習慣在終端機用 [Claude Code](https://claude.com/claude-code) 工作，可直接安裝官方提供的 MCP server `@zenbuapps/zenbu-roadmaps-mcp`，**不必離開命令列就能提 issue、查狀態、（管理員）審核投稿**。底層走 zenbu-roadmaps 後端既有 API，session cookie 直送，0 後端設定。

### 1. 取得 session cookie

MCP server 走 session cookie 直接認證，需要先從瀏覽器取得當前登入的 cookie：

1. 用瀏覽器登入 `https://roadmaps.zenbuapps.com`（或本地開發環境）
2. 開 DevTools → Application → Cookies → 找 `connect.sid`
3. 複製 Cookie Value（會以 `s%3A` 開頭，後接很長一段 URL-encoded 字串）

Cookie 預設 7 天到期；過期後 MCP 呼叫會收到 401，再登入並複製一次即可。

### 2. 設定 Claude Code MCP

編輯 Claude Code 的 MCP config（macOS：`~/Library/Application Support/Claude/claude_desktop_config.json`，Linux：`~/.config/Claude/claude_desktop_config.json`），加入：

```json
{
  "mcpServers": {
    "zenbu-roadmaps": {
      "command": "npx",
      "args": ["-y", "@zenbuapps/zenbu-roadmaps-mcp"],
      "env": {
        "ZENBU_ROADMAPS_API_URL": "https://roadmaps.zenbuapps.com",
        "ZENBU_ROADMAPS_SESSION": "s%3A...複製的 cookie 值..."
      }
    }
  }
}
```

> 本地開發：把 `ZENBU_ROADMAPS_API_URL` 改成 `http://localhost:3000`（需要先 `pnpm dev:api` 起後端），並用本地登入後的 cookie。

重啟 Claude Code，在 MCP 列表會看到 `zenbu-roadmaps` 連同 6 個工具：

| 工具 | 對應動作 | 權限 |
|---|---|---|
| `submit_issue` | 提出新 issue 草稿 | 登入即可 |
| `list_my_issues` | 列出我自己提過的 issue | 登入即可 |
| `withdraw_my_issue` | 撤銷自己的 pending issue | 登入即可（限自己且 pending） |
| `list_admin_issues` | 列出待審核 / 全部投稿 | role=admin |
| `approve_issue` | 通過投稿（自動轉送 GitHub） | role=admin |
| `reject_issue` | 拒絕投稿並填寫理由 | role=admin |

### 3. 一般使用者範例（Claude Code 自然語言）

在 Claude Code 提示框直接用中文/英文敘述需求，Claude 會自動挑選 MCP 工具：

**提一個新 issue**

```
幫我對 zenbu-cms 提一個 issue：
標題：登入按鈕在 Safari 17 點不下去
內容：在 Safari 17.4 (macOS 14.5) 上，登入頁面按下「使用 Google 登入」沒有反應，console 也沒任何 error。Chrome / Firefox 正常。
```

**查我自己提過的 issue**

```
幫我列出我在 zenbu-roadmaps 上提過的所有 issue，重點看待審核的那幾筆。
```

**撤銷某筆 pending issue**

```
幫我撤銷我那筆「登入按鈕在 Safari 17 點不下去」的 issue（id 是 xxx）。
```

撤銷只能對自己提交且狀態為 `pending` 的 issue；已通過、已拒絕、已轉送 GitHub 的不可撤銷。

### 4. Admin 範例（Claude Code 自然語言）

**列出所有待審核投稿**

```
列出 zenbu-roadmaps 上目前所有待審核的 issue，依時間排序，附上作者 email 與 body 預覽。
```

**通過某筆投稿**

```
幫我審核通過 id 為 xxx 的 issue，把它轉送到 GitHub。
```

通過會立即呼叫 GitHub API 建立 issue 並把 `githubIssueNumber` 回填。若 GitHub 端暫時失敗（PAT 過期、rate limit），狀態會停在「已通過（未同步）」、audit log 記下錯誤，admin 可再重試。

**拒絕某筆投稿並回覆理由**

```
幫我拒絕 id 為 xxx 的 issue，理由：這個問題已經在 #123 追蹤，請改去那邊補充重現步驟。
```

拒絕理由會回寫到投稿者的「我的 Issue」頁面，使用者可看到 admin 給的回覆。

### 5. 進一步資訊

- 完整參數說明、錯誤處理、開發者本機跑 MCP 的步驟：[`packages/mcp/README.md`](./packages/mcp/README.md)
- 後端 API 契約：[`packages/shared/src/index.ts`](./packages/shared/src/index.ts) 的 `API_PATHS` / `SubmittedIssueDTO` / `AdminIssueRow`
- 若要改 MCP server 或新增工具：先讀 [CONTRIBUTE.md](./CONTRIBUTE.md) 的 workspace 章節

---

## 想了解更多

- **開發者**：請看 [CONTRIBUTE.md](./CONTRIBUTE.md)（技術堆疊、本地開發、架構說明、部署指引）
- **MCP / Claude Code 整合**：請看 [`packages/mcp/README.md`](./packages/mcp/README.md)（工具參數、錯誤處理、開發指引）
- **專案規範**：[`specs/`](./specs)（資料管線 / 資訊架構 / 投稿流程的穩定契約）
- **AI 協作規範**：[`.claude/CLAUDE.md`](./.claude/CLAUDE.md)（給 Claude Code 與其他 AI 的專案指引）
