---
version: 0.1.0
date: 2026-04-18
status: draft
format: ADR (Architectural Decision Records)
---

# Architecture — Visitor Issue Submission

本檔案以 **ADR**（Architectural Decision Records）格式記錄 V1 所有架構層級決策，包含：候選方案、最終選擇、選擇理由、風險。每條 ADR 對應 `specs/clarify/2026-04-18-1036.md` 的一或多題 Q&A。

---

## 高階資料流圖

### 建立 issue 流程

```
┌──────────┐        ┌─────────────────┐        ┌──────────────────┐        ┌───────────────┐
│ Visitor  │        │ SPA (RoadmapPg) │        │ Cloudflare       │        │ GitHub REST   │
│ browser  │        │ + Modal         │        │ Worker           │        │ API           │
└────┬─────┘        └────────┬────────┘        └─────────┬────────┘        └───────┬───────┘
     │                       │                           │                          │
     │ 1. 點「建立 issue」    │                           │                          │
     ├──────────────────────▶│                           │                          │
     │                       │ 2. 開 Modal + lazy load   │                          │
     │                       │    md-editor chunk        │                          │
     │                       │                           │                          │
     │ 3. 填表單             │                           │                          │
     ├──────────────────────▶│                           │                          │
     │                       │ 4. Turnstile Managed      │                          │
     │                       │    widget → token         │                          │
     │                       │                           │                          │
     │ 5. 送出               │                           │                          │
     ├──────────────────────▶│ 6. POST /api/v1/repos/    │                          │
     │                       │    :name/issues           │                          │
     │                       ├──────────────────────────▶│                          │
     │                       │                           │ 7. 驗 Origin (CORS)     │
     │                       │                           │ 8. 驗 Turnstile token   │
     │                       │                           │    (Cloudflare siteverify)
     │                       │                           │ 9. 驗 payload (length/  │
     │                       │                           │    type / repo allow)  │
     │                       │                           │ 10. 附加「待審核」label │
     │                       │                           ├─────────────────────────▶│
     │                       │                           │ 11. POST /repos/.../issues
     │                       │                           │◀─────────────────────────┤
     │                       │ 12. { success, data }    │ 12. 201 Created         │
     │                       │◀──────────────────────────┤                          │
     │ 13. Toast + 樂觀更新  │                           │                          │
     │◀──────────────────────┤                           │                          │
     │                       │                           │                          │
     │                     ─ ─ ─ 每小時 cron 後 ─ ─ ─    │                          │
     │                       │                           │                          │
     │                       │◀──public/data/*.json──────┼─────(GH Actions rebuild)─┤
     │                       │   新 issue 出現           │                          │
```

### 留言流程（簡化）

與建立 issue 相同，但 endpoint 為 `POST /api/v1/repos/:name/issues/:number/comments`，payload 只有 `body` + `turnstileToken`。

### 錯誤流程

任一步驟失敗：Worker 回 `{ success: false, error: { code, message } }` + 非 2xx HTTP status。前端依 `code` 決定 UI 行為（詳見 `acceptance-criteria.md` AC-Group 3）：

| `code` | Modal 行為 |
|--------|-----------|
| `TURNSTILE_FAILED` | 不關閉、inline 錯誤、reset Turnstile |
| `CORS_REJECTED` | 理論上前端不會遇到（瀏覽器先擋） |
| `INVALID_PAYLOAD` | 不關閉、inline 錯誤、指向對應欄位 |
| `REPO_NOT_ALLOWED` | 不關閉、顯示「此 repo 不接受外部提交」 |
| `UPSTREAM_ERROR` | 不關閉、顯示「稍後再試」、送出按鈕重啟 |
| `RATE_LIMITED` | 不關閉、顯示「請稍後」、送出按鈕延遲重啟（如 60s） |

---

## ADR-001：寫入管道架構

**議題**：訪客的寫入動作要走哪條管道到 GitHub？

### 候選方案

| # | 方案 | 優點 | 缺點 |
|---|------|------|------|
| A | 前端直接呼叫 GitHub API（帶 PAT） | 最少元件 | **絕對不可行**：PAT 必落到前端 bundle |
| B | GitHub Actions `repository_dispatch` + workflow | 完全留在 GitHub 生態、零 Cloudflare 依賴 | workflow 排隊延遲（數十秒至分鐘級）、無法即時回傳新 issue URL |
| C | **Cloudflare Worker proxy** | edge 延遲 < 1s、支援即時回傳、免費額度足夠 V1 | 引入 Cloudflare 為新依賴、失去「純 GitHub Pages」的簡潔定位 |
| D | Vercel / Netlify serverless function | 同 C，可能更熟悉 | 又一個帳號 / 部署系統；本專案沒既存使用 |

### 最終選擇：**C — Cloudflare Worker proxy**

### 理由

1. **延遲可接受**：edge 執行 + GitHub API 通常 < 1s，符合 NFR-001（P95 < 3s）
2. **可回傳具體結果**：訪客送出後 3 秒內看到「issue #42 已建立」+ URL，符合 US-V-004
3. **免費額度**：workers.dev 每日 100k requests，遠高於預期 V1 traffic
4. **隔離性**：寫入 PAT 只存在 Worker 的 wrangler secret，前端完全乾淨
5. **擴充性**：V2 可在 Worker 內加 rate limit、IP reputation、body sanitization，不觸及前端

### 風險

- **新 failure mode**：Cloudflare Worker 宕機 → 寫入功能不可用（讀取仍正常，因為靜態 JSON）
- **跨域依賴**：DNS / CDN / Cloudflare outage 會同時影響多個系統
- **CLAUDE.md「沒有 runtime API」定位需更新**（見 NFR-011）

### 關聯 Q&A

Q1（原選 C repository_dispatch）、**Q4（覆蓋為 Worker proxy）**

---

## ADR-002：Turnstile 接法

**議題**：如何整合 Cloudflare Turnstile 做反爬蟲？

### 候選方案

| # | 方案 | 描述 |
|---|------|------|
| A | Pre-clearance mode + 全站 challenge | 訪客首次進站時先過 Turnstile，取得 cookie；後續寫入免再驗 |
| B | **Managed mode + Modal inline + 環境變數分離** | Turnstile widget 嵌在 Modal 內，送出前須過 challenge；Site Key 前端 env、Secret Key Worker wrangler secret |
| C | Invisible mode（非互動） | 自動在背景驗，失敗時才彈 challenge |
| D | 自建 CAPTCHA / honeypot | 輕量但對真實攻擊防禦弱 |

### 最終選擇：**B — Managed + Modal inline + env var 分離**

### 理由

1. **情境合適**：寫入操作頻率低（每天數十次），不需要 pre-clearance 的 session 機制
2. **明確的使用者預期**：Modal 內顯示 challenge，訪客理解這是「送出前的驗證」，心理摩擦低
3. **安全性**：Site Key 公開、Secret Key 只在 Worker；即使 Site Key 外洩也無法偽造 token（Secret 由 Cloudflare siteverify 驗證）
4. **UX**：Managed mode 能自動偵測風險等級，多數正常訪客通過無感

### 設定清單

| Key | 類型 | 位置 | 暴露 |
|-----|------|------|------|
| `VITE_TURNSTILE_SITE_KEY` | 公開 | 前端 build env（GitHub repo secret → workflow env） | 前端 bundle（OK） |
| `TURNSTILE_SECRET_KEY` | 私密 | Worker wrangler secret | 只在 Worker runtime |

### 風險

- **Turnstile 服務宕機** → 寫入功能同時不可用。V1 可接受（列入 OQ-005）。
- **Managed mode 偶爾誤判**：真實訪客被擋時的 fallback 體驗。必須有清楚的 inline 錯誤與重試 UI（FR-006 已規範）。

### 關聯 Q&A

Q17

---

## ADR-003：Issue 分類機制

**議題**：訪客建立的 issue 如何分類（Bug / Feature / Task）？

### 候選方案

| # | 方案 | 描述 |
|---|------|------|
| A | 純 label | 前端下拉選，Worker 附加對應 label（如 `bug` / `feature` / `question`） |
| B | **GitHub Issue Types + 預建 label** | 用 org-level Issue Types 分類，額外附加 `待審核` label 供 triage |
| C | 只做 triage（不給訪客分類） | 所有 issue 統一附 `待審核`，分類由 maintainer 手動做 |

### 最終選擇：**B — Issue Types + `待審核` label**

### 理由

1. **GitHub Issue Types 已 GA**：2024/09 org-level feature GA，2025-03-18 REST API GA
2. **語意清楚**：Type 是 issue 的分類本質，label 是過濾 / triage 用的標記。兩者職責分離
3. **向後相容**：對沒啟用 Issue Types 的 org，前端隱藏 type 欄位，Worker 不帶 type，行為退化為 C（只做 triage）
4. **maintainer 流程簡化**：可直接 filter `label:待審核` 找到待處理，不需自建 label 規範

### 技術細節

- **API 端點**：
  - 讀取可用 types：`GET /orgs/{org}/issue-types`（需要 `admin:org` read scope，見 OQ-003）
  - 建立 issue：`POST /repos/{owner}/{repo}/issues` 的 request body 加 `type: "Bug"`（字串，非 slug）
- **@octokit/rest v21.1.1**：已 auto-generated from OpenAPI，應已支援 type 欄位；實作時需驗證
- **`待審核` label 名稱**：UTF-8 中文字。Octokit 自動處理 JSON body 的 UTF-8 encoding。若某 repo 尚未建立此 label，Worker 先 `POST /repos/{owner}/{repo}/labels` 建立再重試建 issue（Q16 語意）

### 風險

- **Issue Types 仍算新功能**：部分 Octokit 版本可能不完整支援。若遇到需手動 `request('POST /repos/...', { type: '...' })` 繞過 typed method
- **label 中文編碼**：若未來改用裸 `fetch`，URL path / query string 裡的中文要 `encodeURIComponent`（payload body 的中文由 `JSON.stringify` 自動處理）

### 關聯 Q&A

Q7、Q14、Q16

---

## ADR-004：`canSubmitIssue` 決策與 OverviewPage 分區

**議題**：哪些 repo 接受訪客提交？UI 如何呈現？

### 候選方案

| # | 方案 | 描述 |
|---|------|------|
| A | 所有 public repo 皆可 | 最寬鬆；可能散佈提交入口到無 milestone 的 repo，污染回饋品質 |
| B | **Fetcher 計算 `canSubmitIssue` + OverviewPage 兩區塊** | 新增 `RepoSummary.canSubmitIssue`，V1 規則：`!isPrivate && milestoneCount > 0` |
| C | 讀取 `.github/zenbu-milestones.yml` 自訂開關 | 最彈性；但 fetcher 要多抓一次，且 maintainer 要額外維護設定檔 |
| D | 手動 maintain allow-list（hard-code） | 簡單；不具彈性，每加 repo 都要改程式碼 |

### 最終選擇：**B — Fetcher 計算 canSubmitIssue + OverviewPage 分區**

### 理由

1. **無額外 fetcher 呼叫**：`isPrivate` 和 `milestoneCount` 都是 fetcher 已有資料
2. **語意合理**：有 milestone = 這個 repo 正在積極維護，歡迎外部 issue；無 milestone = 可能是 archive / demo / 未正式啟動，不適合外部提交
3. **UI 明確分流**：OverviewPage 兩區塊，訪客一眼看出哪些可提交
4. **未來可擴充**：C 方案可作為 V2 補強（見 OQ-001）

### V1 規則

```ts
canSubmitIssue = !repo.isPrivate && milestones.length > 0
```

### 後端雙重檢查

前端的 `canSubmitIssue` 檢查僅是 UX 層（hide 按鈕）。Worker 必須**獨立檢查**同一條件，防止有人繞過前端直接 POST（FR-009、US-W-002）。Worker 的檢查來源見 **ADR-007**。

### 風險

- **fetcher 與 Worker 資料不同步**：fetcher 產新 summary.json 後，Worker cache 未失效可能短暫回 `REPO_NOT_ALLOWED`。ADR-007 的 cache 策略要控制 staleness

### 關聯 Q&A

Q19

---

## ADR-005：Worker 部署域名

**議題**：Worker 要綁 custom domain 還是用 workers.dev 子域？

### 候選方案

| # | 方案 | 成本 / 風險 |
|---|------|-------------|
| A | **`*.workers.dev` 免費子域 + CORS 白名單** | 免費；DNS 無需額外設定 |
| B | `api.zenbu-milestones.zenbuapps.dev`（custom domain） | 需要 DNS + Cloudflare Zone + SSL cert；更正式 |
| C | 同 origin（透過 Cloudflare Pages Functions） | 整合 GitHub Pages 與 Worker 成同 origin，省 CORS 複雜度 | 但本專案已在 GitHub Pages，不易遷移 |

### 最終選擇：**A — workers.dev 免費子域**

### 理由

1. **成本**：V1 免 DNS / 免 SSL / 免 Zone 月費
2. **足夠**：訪客不會直接記 Worker URL，前端 build-time 注入 `VITE_WORKER_URL` 即可
3. **快速 ship**：不卡 DNS 驗證 / SSL 設定
4. **CORS 白名單足以隔離**：只放三個合法 Origin

### 建議命名

```
https://zenbu-milestones-worker.<cf-account>.workers.dev
```

實際子域由 Cloudflare account 決定。CI 部署後記 URL 到 repo secret `VITE_WORKER_URL` 供 Vite build 注入。

### 未來遷移

若 V2 需要 custom domain（例：企業政策、白標）→ `wrangler.toml` 加 `routes` 即可，Worker code 無需改動。

### 關聯 Q&A

Q18

---

## ADR-006：PAT 雙 token 策略

**議題**：寫入功能是否要用獨立 PAT？

### 候選方案

| # | 方案 | 安全性 / 運維 |
|---|------|----------------|
| A | 共用 `ZENBU_ORG_READ_TOKEN`（擴大 scope 加 Issues:Write） | 簡單；但洩漏一次全毀 |
| B | **新增 `ZENBU_ORG_WRITE_TOKEN`（issues:write，獨立）** | 職責分離；洩漏影響面限縮 |
| C | GitHub App installation token（short-lived） | 最高安全等級；需註冊 GitHub App + OIDC 換 token 機制 |

### 最終選擇：**B — 雙 PAT**

### Token 配置

| PAT | Scope（fine-grained）| 位置 | 失效影響 |
|-----|----------------------|------|----------|
| `ZENBU_ORG_READ_TOKEN` | Contents / Issues / Metadata：Read-only | GitHub Actions secret | Fetcher 無法跑，儀表板停在舊資料 |
| `ZENBU_ORG_WRITE_TOKEN` | Issues：Read + Write；Metadata：Read；（選配）Organization administration：Read-only（給 issue-types listing） | Cloudflare Worker wrangler secret | 寫入功能不可用；讀取不受影響 |

### 理由

1. **Blast radius 最小化**：Write PAT 洩漏最多讓攻擊者亂建 issue / 留言（仍受 `待審核` label 與 maintainer 分流保護），不影響 repo code / admin
2. **Rotate 彼此獨立**：一方過期不影響另一方
3. **遷移 path 明確**：V2 可升級為 GitHub App 而不需改前端 / UX

### 關聯 Q&A

Q2

---

## ADR-007：Worker 端 `canSubmitIssue` 查驗來源

**議題**：Worker 要如何知道「target repo 是否允許提交」？

### 候選方案

| # | 方案 | 即時性 | 維運 |
|---|------|--------|------|
| A | **Worker fetch `zenbuapps.github.io/zenbu-milestones/data/summary.json`（含 cache）** | cache 內近即時（5 分鐘 stale） | 零維運；同一 source of truth |
| B | Worker 每次 request 都呼叫 GitHub API 檢查 repo | 即時 | 多一次 round-trip，2x 延遲 |
| C | Worker hard-code allow-list | 即時 | 每加 repo 都要改程式碼 + 部署 |
| D | Worker 用 KV 存 allow-list（定期 sync） | 近即時 | 多一個組件（Cloudflare KV），初始化成本 |

### 最終選擇：**A — fetch summary.json + Cloudflare Cache API（5 分鐘 TTL）**

### 理由

1. **單一事實來源**：與前端 render 相同的 JSON，消除 front/back 不一致風險
2. **零額外存儲**：不引入 KV / D1
3. **延遲可控**：cache hit 時幾乎零延遲；cache miss 時多一次 GitHub Pages fetch（通常 < 300ms）

### 實作提示

```ts
// Worker
async function isRepoAllowed(repoName: string): Promise<boolean> {
  const cacheKey = new Request('https://internal/summary-cache');
  const cached = await caches.default.match(cacheKey);
  let summary;
  if (cached) {
    summary = await cached.json();
  } else {
    const resp = await fetch('https://zenbuapps.github.io/zenbu-milestones/data/summary.json');
    summary = await resp.json();
    const cacheResp = new Response(JSON.stringify(summary), {
      headers: { 'Cache-Control': 'max-age=300', 'Content-Type': 'application/json' }
    });
    await caches.default.put(cacheKey, cacheResp.clone());
  }
  const repo = summary.repos.find(r => r.name === repoName);
  return repo?.canSubmitIssue === true;
}
```

### 風險

- **短暫 stale**：fetcher 產出新 JSON 到 Worker cache 失效之間最多 5 分鐘，新 repo 加入時提交會被誤拒。V1 可接受。
- **GitHub Pages 出包**：summary.json 不可用時 Worker 無法驗證 → 應有 fallback（例：拒絕所有寫入或讀上一份 cache 放寬）。列入 OQ-004。

### 關聯 Q&A

Q19（衍生）、US-W-002

---

## ADR-008：Worker 程式碼位置與部署

**議題**：Worker 程式碼放哪裡？如何部署？

### 候選方案

| # | 方案 | 優點 | 缺點 |
|---|------|------|------|
| A | **本 repo `worker/` 子目錄（monorepo）** | 共用 CI、PAT rotation 同 PR | 主 repo 結構變複雜 |
| B | 獨立 repo（`zenbu-milestones-worker`） | 解耦、職責清晰 | 跨 repo PR 配對痛苦 |
| C | Cloudflare 的 web UI edit | 最快 | 無 VCS、無 review 流程，不可持續 |

### 最終選擇：**A — monorepo `worker/` 子目錄**

### 目錄結構（預期）

```
zenbu-milestones/
├── src/                          ← 前端（現有）
├── scripts/                      ← build-time fetcher（現有）
├── public/                       ← static assets + data/（現有）
├── worker/                       ← ★ 新
│   ├── src/
│   │   ├── index.ts              ← Worker entry
│   │   ├── handlers/
│   │   │   ├── createIssue.ts
│   │   │   └── createComment.ts
│   │   ├── middleware/
│   │   │   ├── cors.ts
│   │   │   ├── turnstile.ts
│   │   │   └── payloadValidation.ts
│   │   └── lib/
│   │       ├── github.ts         ← @octokit/rest wrapper
│   │       └── canSubmit.ts      ← ADR-007 實作
│   ├── wrangler.toml             ← Worker 設定（name, main, compatibility_date, vars）
│   ├── tsconfig.json             ← target Worker runtime
│   └── package.json              ← 可選，若用獨立 pnpm workspace
├── .github/workflows/build-and-deploy.yml  ← 擴充加入 Worker deploy job
├── package.json                  ← 根 workspace，加 `worker/*` 到 workspaces（若用 pnpm workspace）
└── ...
```

### CI 流程（詳見 `deployment.md`）

1. `pnpm install --frozen-lockfile`（含 worker 的依賴）
2. `pnpm --filter worker run build`（若需要）或直接用 `wrangler deploy --cwd worker`
3. `cloudflare/wrangler-action@v3`：部署 Worker
4. 完成後繼續原有 `fetch-data` + `vite build` + `upload-pages-artifact` + `deploy-pages`

### 關聯 Q&A

Q5

---

## ADR-009：樂觀更新策略

**議題**：寫入成功後 UI 如何同步？

### 候選方案

| # | 方案 | 描述 |
|---|------|------|
| A | 完全等靜態 JSON 重跑（延遲 1 小時） | UX 糟糕，訪客看不到自己送出的結果 |
| B | 即時調用 GitHub API 重抓該 repo | 引入前端 read 路徑，跟靜態 JSON 路徑衝突 |
| C | **混合：樂觀更新 + 下次 cron 同步** | 即時 UX + 最終一致性 |

### 最終選擇：**C — 混合方案**

### 實作細節

#### 建立 issue

- Worker 回 `{ number, htmlUrl, title, type, labels }`
- 前端組一個 `IssueLite` 物件：
  ```ts
  const optimisticIssue: IssueLite = {
    number: data.number,
    title: data.title,
    state: 'open',
    htmlUrl: data.htmlUrl,
    labels: data.labels.map(name => ({ name, color: '888888' })),
    assignees: [],
    updatedAt: new Date().toISOString(),
    type: data.type ?? null,
    // ... 其他欄位用合理預設
  };
  ```
- 以 `Outlet context` 或 React state lifter append 到對應 milestone 的 `issues` 陣列

#### 留言

- Worker 回 `{ id, htmlUrl }`
- 前端**不更新本地 state**（`IssueLite` 無 comments 欄位）
- Toast 連結到 GitHub 的 `#issuecomment-{id}` 錨點

#### 重整後的行為

- 重整 → 重 fetch `public/data/*.json` → 樂觀更新 state 遺失
- 若下次 cron（≤ 1 小時後）已跑 → 新 issue 出現在 JSON → UI 正常
- 若重整時 cron 還沒跑 → 新 issue 暫時消失，下次 cron 後再次出現

此 UX 瑕疵可接受（V1），訪客心智模型是「已送到 GitHub，GitHub 是事實」。

### 關聯 Q&A

Q8-Q11、Q12

---

## ADR-010：Markdown 編輯器選型

### 候選方案

| # | 套件 | Bundle size | GFM 支援 | React 整合 |
|---|------|-------------|---------|-----------|
| A | `react-markdown`（純預覽） | 小 | 需外掛 | 簡單 |
| B | **`@uiw/react-md-editor`** | 中 | GFM 原生 | 完整 |
| C | `@monaco-editor/react` | 大 | 需自配 | 完整但偏重程式碼編輯 |
| D | `codemirror` + 自製 toolbar | 中 | 需自配 | 需組裝 |

### 最終選擇：**B — `@uiw/react-md-editor`**

### 理由

1. **工具列 + 預覽 + GFM 一次到位**：不需手組
2. **Tailwind 相容**：可用 className 覆寫樣式
3. **React 18 支援**：維護活躍
4. **體積可控**：lazy load 後不影響 initial paint（NFR-007）

### 設定要點

```tsx
const MDEditor = lazy(() => import('@uiw/react-md-editor'));

<Suspense fallback={<LoadingSpinner size="md" />}>
  <MDEditor
    value={body}
    onChange={setBody}
    preview="edit"        // Modal 內空間有限，預設只顯示編輯區
    data-color-mode="light"  // 配合現有 light-only 設計
  />
</Suspense>
```

### 關聯 Q&A

Q12

---

## ADR 總覽表

| ADR | 主題 | 最終選擇 | 關聯 Q |
|-----|------|----------|--------|
| 001 | 寫入管道 | Cloudflare Worker proxy | Q1 / Q4 |
| 002 | Turnstile 接法 | Managed + Modal inline + env var 分離 | Q17 |
| 003 | Issue 分類機制 | Issue Types + `待審核` label | Q7 / Q14 / Q16 |
| 004 | `canSubmitIssue` 語意與 UI 分區 | Fetcher 計算 + OverviewPage 兩區塊 | Q19 |
| 005 | Worker 部署域名 | workers.dev 子域 + CORS 白名單 | Q18 |
| 006 | PAT 雙 token | Read / Write 分離 | Q2 |
| 007 | Worker `canSubmitIssue` 查驗來源 | fetch summary.json + Cache API (TTL 5 min) | Q19 衍生 |
| 008 | Worker 程式碼位置 | 本 repo `worker/` monorepo | Q5 |
| 009 | 樂觀更新策略 | 混合：樂觀更新 + cron 最終一致 | Q11 |
| 010 | Markdown 編輯器選型 | @uiw/react-md-editor | Q12 |
