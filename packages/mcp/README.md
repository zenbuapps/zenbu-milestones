# `@zenbuapps/zenbu-roadmaps-mcp`

讓本地 [Claude Code](https://claude.com/claude-code)（或其他支援 MCP 的 client）能直接呼叫 [zenbu-roadmaps](https://github.com/zenbuapps/zenbu-roadmaps) 的 issue 流程：

- **一般使用者**：對 zenbuapps org 下任一 repo 提出 issue 草稿、列出自己提過的 issue、撤銷尚未審核的草稿。
- **Admin**：列出待審核 issue、通過、拒絕。

## 工具列表

| Tool | 對應後端 API | 權限 |
|---|---|---|
| `submit_issue` | `POST /api/issues` | 登入即可 |
| `list_my_issues` | `GET /api/me/issues` | 登入即可 |
| `withdraw_my_issue` | `DELETE /api/me/issues/:id` | 登入即可（限自己且狀態為 pending） |
| `list_admin_issues` | `GET /api/admin/issues` | role=admin |
| `approve_issue` | `POST /api/admin/issues/:id/approve` | role=admin |
| `reject_issue` | `POST /api/admin/issues/:id/reject` | role=admin |

## 安裝

### 一、取得 session cookie

MCP server v1 走 session cookie 直接認證，不需要動到後端。請依以下步驟取得當前登入的 cookie 值：

1. 用瀏覽器登入 https://roadmaps.zenbuapps.com（或本地開發環境）
2. 開 DevTools → Application → Cookies → 找到 `connect.sid`
3. 複製整段 Cookie Value（會以 `s%3A` 開頭，後面接很長一段 URL-encoded 字串）

> Cookie 預設 7 天到期；過期後 MCP 呼叫會收到 401，重新登入並複製即可。

### 二、設定 Claude Code MCP

編輯 Claude Code 的 MCP config（macOS：`~/Library/Application Support/Claude/claude_desktop_config.json`；Linux：`~/.config/Claude/claude_desktop_config.json`），加入：

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

重啟 Claude Code 之後，在 MCP 列表應該會看到 `zenbu-roadmaps` 並列出 6 個工具。

### 三、（開發者）本機跑 MCP

```bash
pnpm --filter @zenbuapps/zenbu-roadmaps-mcp build

ZENBU_ROADMAPS_API_URL=http://localhost:3000 \
ZENBU_ROADMAPS_SESSION='s%3A...' \
node packages/mcp/dist/index.js
```

## 對應後端契約

- envelope：`{ success: true, data }` 或 `{ success: false, error: { code, message } }`
- AuthenticatedGuard：401 表示 session 失效；本工具會自動在錯誤訊息附上重新登入提示
- AdminGuard：admin 工具會在非 admin 帳號呼叫時回 403；本工具會附上權限提示

## FAQ

**Q：撤銷不能用？**
撤銷只能對自己提交、狀態為 `pending` 的 issue。`approved`、`rejected`、`synced-to-github` 不可撤銷（已被審核或已建到 GitHub）。

**Q：Approve 失敗了，issue 變成 `approved` 但沒進 GitHub？**
這是後端設計的「先 GitHub → 再 DB」原子性策略的可預期情況：GitHub API 失敗（PAT 過期、rate limit）→ DB 推進為 `approved` 但 `githubIssueNumber=null`，audit log 留下錯誤 code。後續可由 admin 在後台 UI 重試（後端 reapprove flow 規劃中）。

**Q：MCP 一直回 401？**
1. session 是 7 天到期，再登入一次重新複製 cookie
2. 確認瀏覽器登入的是 `ZENBU_ROADMAPS_API_URL` 指到的同一個 origin（prod / local 各自獨立 cookie）
3. 確認 cookie 值有沒有複製到 `s%3A` 前綴

## 授權

Private（zenbuapps 內部使用）。
