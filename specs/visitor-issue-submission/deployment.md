---
version: 0.1.0
date: 2026-04-18
status: draft
depends_on:
  - specs/deployment.md
  - .claude/rules/pnpm-and-ci.rule.md
---

# Deployment Spec — Visitor Issue Submission

本檔案定義 V1 部署層的所有變更：新增 Worker 子專案、擴充 CI workflow、新增 secrets、PAT rotation 流程、CORS 設定。此 spec 不取代 `specs/deployment.md`，而是**疊加**在其之上。

---

## 1. 部署拓撲（V1 之後）

```
                                    ┌────────────────────┐
                                    │  GitHub Pages      │
                                    │  zenbuapps.github.io
                                    │  /zenbu-milestones/│
                                    └────────────────────┘
                                              ▲
                                              │ deploy-pages
                                              │
┌──────────────────┐   push/cron   ┌────────────────────┐    deploy-worker     ┌──────────────────────┐
│ GitHub Repo      │ ────────────▶ │  GitHub Actions     │ ──────────────────▶ │  Cloudflare Workers  │
│ zenbu-milestones │               │  build-and-deploy   │                     │  *.workers.dev       │
│                  │               │  .yml               │                     │                      │
└──────────────────┘               └────────────────────┘                     └──────────────────────┘
                                                                                        │
                                                                                        │ (runtime)
                                                                                        ▼
                                                                              ┌──────────────────────┐
                                                                              │  GitHub REST API     │
                                                                              │  api.github.com      │
                                                                              └──────────────────────┘
```

**兩個部署目標，一個 workflow**：
- `deploy-pages`（既有）→ GitHub Pages
- `deploy-worker`（新）→ Cloudflare Workers

---

## 2. `worker/` 子目錄結構

```
worker/
├── src/
│   ├── index.ts                      ← Worker 入口（Router + handler dispatch）
│   ├── handlers/
│   │   ├── createIssue.ts
│   │   └── createComment.ts
│   ├── middleware/
│   │   ├── cors.ts                   ← Origin 白名單檢查
│   │   ├── turnstile.ts              ← Cloudflare siteverify
│   │   └── payloadValidation.ts      ← zod / 手刻 schema check
│   └── lib/
│       ├── github.ts                 ← @octokit/rest 包裝
│       ├── canSubmit.ts              ← ADR-007：fetch summary.json + cache
│       └── logger.ts                 ← 結構化 log
├── wrangler.toml                     ← Worker 設定
├── tsconfig.json
├── package.json                      ← 獨立 dependencies
└── README.md                         ← Worker 本地開發說明
```

### 2.1 `wrangler.toml`

```toml
name = "zenbu-milestones-worker"
main = "src/index.ts"
compatibility_date = "2026-04-18"
workers_dev = true       # 使用 *.workers.dev 免費子域

# Production（staging / review 環境選配，見 OQ-002）
[env.production]
name = "zenbu-milestones-worker"

# vars 區塊放非敏感設定
[vars]
GITHUB_ORG = "zenbuapps"
SUMMARY_JSON_URL = "https://zenbuapps.github.io/zenbu-milestones/data/summary.json"
ALLOWED_ORIGINS = "https://zenbuapps.github.io,http://localhost:5173,http://localhost:4173"

# secrets 不寫入 toml，使用 `wrangler secret put`：
#   wrangler secret put ZENBU_ORG_WRITE_TOKEN
#   wrangler secret put TURNSTILE_SECRET_KEY
```

### 2.2 `package.json`（worker 子專案）

若採 pnpm workspace：

```json
{
  "name": "@zenbu/worker",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@octokit/rest": "^21.1.1"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.x",
    "typescript": "^5.x",
    "wrangler": "^3.x"
  }
}
```

根 `package.json` 視 pnpm workspace 使用情況決定是否加 `workspaces: ["worker"]`。若走單一 package（worker 依賴併入主 package.json），則省略此步驟，但 `wrangler` / `@cloudflare/workers-types` 仍需加為 devDependency。

### 2.3 `tsconfig.json`（worker）

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "WebWorker"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts"]
}
```

與既有 `scripts/tsconfig.json`（Node target）、`tsconfig.app.json`（Browser target）並列為第三個獨立 project reference。

### 2.4 `pnpm typecheck` 覆蓋

根 `tsconfig.json` 加 worker reference：

```json
{
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./scripts/tsconfig.json" },
    { "path": "./worker/tsconfig.json" }
  ]
}
```

---

## 3. CI workflow 擴充

### 3.1 `.github/workflows/build-and-deploy.yml` 結構

```yaml
name: build-and-deploy

on:
  schedule:
    - cron: '0 * * * *'
  push:
    branches: [master]
  workflow_dispatch:

concurrency:
  group: pages
  cancel-in-progress: false

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  # ★ 新 job
  deploy-worker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10.32.1

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Deploy Worker to Cloudflare
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: worker
          command: deploy
        env:
          # Worker secrets 已透過 `wrangler secret put` 事先設定，不在 CI 中設
          # 此處只傳 CF_API_TOKEN + CF_ACCOUNT_ID 讓 wrangler 能 push code
          NOOP: ''

  build:
    runs-on: ubuntu-latest
    # 若想確保 Worker 部署成功後才部署 Pages：
    # needs: deploy-worker
    # （V1 可選，較保守）
    steps:
      - uses: actions/checkout@v4

      - name: Validate ZENBU_ORG_READ_TOKEN
        run: |
          if [ -z "${{ secrets.ZENBU_ORG_READ_TOKEN }}" ]; then
            echo "::error::ZENBU_ORG_READ_TOKEN secret is required"
            exit 1
          fi

      - uses: pnpm/action-setup@v4
        with:
          version: 10.32.1
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: pnpm
      - run: pnpm install --frozen-lockfile

      - name: Fetch zenbuapps org data
        env:
          GH_TOKEN: ${{ secrets.ZENBU_ORG_READ_TOKEN }}
        run: pnpm run fetch-data

      - uses: actions/configure-pages@v5
        with:
          enablement: true

      - name: Build
        env:
          # ★ 新 env：Turnstile Site Key（公開，build-time 注入前端 bundle）
          VITE_TURNSTILE_SITE_KEY: ${{ secrets.VITE_TURNSTILE_SITE_KEY }}
          # ★ 新 env：Worker URL（public，用於前端組 fetch URL）
          VITE_WORKER_URL: ${{ secrets.VITE_WORKER_URL }}
        run: pnpm run build

      # ★ 新：檢查 bundle 不含寫入 PAT（NFR-002）
      - name: Security scan — no write PAT in bundle
        run: |
          if grep -rE 'ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{80,}' dist/; then
            echo "::error::Write PAT leaked into frontend bundle"
            exit 1
          fi

      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

### 3.2 Job 依賴設計選擇

| 模式 | Worker 失敗時 Pages 行為 |
|------|------------------------|
| `build: needs: deploy-worker`（推薦） | Pages 不部署，保持前後版本一致 |
| 無 `needs`（平行） | Pages 部署新版但 Worker 仍舊版 → 寫入功能可能 500（若 API 有變） |

V1 採第一種（保守）。

### 3.3 Permissions 調整

| 權限 | 理由 |
|------|------|
| `contents: read` | checkout |
| `pages: write` | deploy-pages |
| `id-token: write` | OIDC for Pages |

**不需要**加 `actions: write` / `secrets: write`。Cloudflare 認證透過 `CLOUDFLARE_API_TOKEN` repo secret 完成。

---

## 4. Repository Secrets 清單

### 4.1 既有（維持）

| Secret | 用途 | 備註 |
|--------|------|------|
| `ZENBU_ORG_READ_TOKEN` | Fetcher 呼叫 GitHub | fine-grained PAT，Contents / Issues / Metadata 唯讀 |

**若採用 fetcher 產出 issue-types.json**（見 ADR-003）：需擴充此 PAT 的 scope 加入 `admin:org` read。**或**改由 Worker 以寫 PAT 代查（OQ-003）。

### 4.2 新增

| Secret | 值 | 用途 |
|--------|---|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token（`Workers Scripts:Edit` + `Account:Read`）| `deploy-worker` job 登入 |
| `CLOUDFLARE_ACCOUNT_ID` | 32-char hex | `deploy-worker` job 指定 account |
| `VITE_TURNSTILE_SITE_KEY` | Turnstile Site Key（公開值，但放 secret 方便管理）| 前端 build-time 注入 |
| `VITE_WORKER_URL` | `https://zenbu-milestones-worker.<cf-account>.workers.dev` | 前端 build-time 注入 |

> `VITE_*` 前綴的變數會被 Vite 注入到前端 bundle，最終公開可見。放在 secret 裡**不是為了保密**，而是為了統一管理、避免 hard-code。

### 4.3 新增（Worker 端 wrangler secret，非 GitHub repo secret）

透過 `wrangler secret put` 命令設定，**不存在 GitHub 中**：

| Wrangler Secret | 用途 |
|-----------------|------|
| `ZENBU_ORG_WRITE_TOKEN` | Worker 呼叫 GitHub 寫 API |
| `TURNSTILE_SECRET_KEY` | Worker 呼叫 Cloudflare siteverify |

**設定命令**（第一次部署前執行）：

```bash
cd worker
wrangler secret put ZENBU_ORG_WRITE_TOKEN
# prompt 貼入 fine-grained PAT
wrangler secret put TURNSTILE_SECRET_KEY
# prompt 貼入 Turnstile secret
```

---

## 5. PAT 規範與 rotation

### 5.1 `ZENBU_ORG_WRITE_TOKEN` 設定

- **類型**：fine-grained PAT（禁用 classic）
- **Owner**：`zenbuapps` org
- **Repository access**：All repositories under zenbuapps
- **Permissions**：
  - Issues — **Read and write**
  - Metadata — Read-only
  - （可選）Organization administration — Read-only（若 Worker 要代查 issue-types）
- **Expiration**：建議 90 天
- **儲存位置**：**只在** Cloudflare Worker 的 wrangler secret

### 5.2 `ZENBU_ORG_READ_TOKEN` 不變

維持現有 `specs/deployment.md` 定義的 read-only PAT。若需產出 `issue-types.json` 且採 fetcher 方案，補加 `admin:org` read。

### 5.3 Rotation Runbook

#### Write PAT 即將過期

1. Generate 新 fine-grained PAT（同 scope）
2. 本地執行 `wrangler secret put ZENBU_ORG_WRITE_TOKEN`，貼入新 token
3. 觸發 `workflow_dispatch` 驗證（先用 curl 測 Worker 寫入 endpoint，確認可建 test issue 到某個 non-production repo）
4. Revoke 舊 token

#### Read PAT 即將過期

依 `specs/deployment.md` 既有流程，一次 rotation 影響一個系統。

#### Cloudflare API Token 即將過期

1. 在 Cloudflare Dashboard 產生新 token（同 permissions）
2. 更新 repo secret `CLOUDFLARE_API_TOKEN`
3. 手動觸發 workflow 驗證

---

## 6. Cloudflare Turnstile 設定

### 6.1 建立 Site

1. Cloudflare Dashboard → Turnstile → Add site
2. Domain：`zenbuapps.github.io`（production）+ 可選 `localhost`（開發）
3. Widget Mode：**Managed**
4. 取得 Site Key + Secret Key

### 6.2 Key 分配

| Key | 去處 |
|-----|------|
| Site Key | GitHub repo secret `VITE_TURNSTILE_SITE_KEY` → build-time 注入前端 bundle |
| Secret Key | Worker wrangler secret `TURNSTILE_SECRET_KEY` → runtime |

---

## 7. CORS 設定

### 7.1 Worker 實作

Worker 在每個 request 開始處檢查 `Origin` header：

```ts
// worker/src/middleware/cors.ts
const ALLOWED_ORIGINS = new Set([
  'https://zenbuapps.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
]);

export function withCors(handler: RequestHandler): RequestHandler {
  return async (request, env, ctx) => {
    const origin = request.headers.get('Origin');

    // Preflight
    if (request.method === 'OPTIONS') {
      if (!origin || !ALLOWED_ORIGINS.has(origin)) {
        return new Response(null, { status: 403 });
      }
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Actual request
    if (!origin || !ALLOWED_ORIGINS.has(origin)) {
      return new Response(JSON.stringify({
        success: false,
        error: { code: 'CORS_REJECTED', message: '此 Origin 不在允許清單內' }
      }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }

    const response = await handler(request, env, ctx);
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Vary', 'Origin');
    return response;
  };
}
```

### 7.2 為何精確回傳 origin（非 `*`）

見 NFR-005。即便 V1 沒用 credentials，未來擴充（例加 cookie session）時不需再改 CORS 邏輯。

---

## 8. 本地開發流程

### 8.1 前端

```bash
# 設 .env.local
echo "VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA" > .env.local   # Turnstile 測試 key
echo "VITE_WORKER_URL=http://localhost:8787" >> .env.local

pnpm dev
```

> Turnstile 提供的測試 key `1x00000000000000000000AA` 會自動通過；`TURNSTILE_SECRET_KEY` 用 `1x0000000000000000000000000000000AA` 配對。

### 8.2 Worker

```bash
cd worker
# 首次：設本地 .dev.vars（不進 git）
cat <<EOF > .dev.vars
ZENBU_ORG_WRITE_TOKEN=ghp_xxx
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
EOF

pnpm run dev   # wrangler dev @ http://localhost:8787
```

`.dev.vars` 需加入 `.gitignore`。

### 8.3 並行跑前端 + Worker

開兩個 terminal：
- T1: `pnpm dev`（前端 @ http://localhost:5173）
- T2: `cd worker && pnpm run dev`（Worker @ http://localhost:8787）

前端的 Modal 送出會打到 T2 的 Worker，Worker 打實際 GitHub API 建立 test issue。**建議使用 test repo**，避免污染 production。

---

## 9. 部署驗證 checklist（V1 新增項目）

```bash
# 1. 檢查 workflow
gh run list --workflow=build-and-deploy.yml --limit 1

# 2. 驗證 Worker deployed
curl -i https://zenbu-milestones-worker.<cf-account>.workers.dev/health
# 預期：200 OK + { "status": "ok" }（需實作一個 health endpoint）

# 3. 驗證 CORS preflight
curl -i -X OPTIONS https://zenbu-milestones-worker.<cf-account>.workers.dev/api/v1/repos/test/issues \
  -H "Origin: https://zenbuapps.github.io" \
  -H "Access-Control-Request-Method: POST"
# 預期：204 + Access-Control-Allow-Origin 對應白名單

# 4. 驗證 CORS 拒絕
curl -i -X OPTIONS https://zenbu-milestones-worker.<cf-account>.workers.dev/api/v1/repos/test/issues \
  -H "Origin: https://evil.example.com"
# 預期：403

# 5. 驗證 Turnstile（需真實 Site Key + 瀏覽器）
# 手動：打開 https://zenbuapps.github.io/zenbu-milestones/ 測試建立 issue

# 6. 驗證前端 bundle 無 PAT
curl -s https://zenbuapps.github.io/zenbu-milestones/assets/*.js | grep -E 'ghp_|github_pat_' || echo "OK: no PAT found"

# 7. 驗證 issue-types.json
curl -s https://zenbuapps.github.io/zenbu-milestones/data/issue-types.json | jq
```

---

## 10. 失敗模式與處置

| 症狀 | 可能原因 | 處置 |
|------|---------|------|
| `deploy-worker` job 紅 | `CLOUDFLARE_API_TOKEN` 過期 / wrong scope | 重新生成，更新 repo secret |
| Worker 回 502 UPSTREAM_ERROR | `ZENBU_ORG_WRITE_TOKEN` 過期 | `wrangler secret put` 更新 |
| Turnstile 一律失敗 | Site Key / Secret Key 不配對 | Cloudflare Dashboard 重核對 |
| 前端 CORS error | Origin 不在白名單 / Worker 沒部署到預期 URL | 檢查 `VITE_WORKER_URL` 與 Worker 實際 URL |
| 建立 issue 成功但儀表板沒顯示 | 樂觀更新 ok，但下次 cron 還沒跑 | 等最多 1 小時；手動 `gh workflow run build-and-deploy.yml` |
| Worker 間歇性 REPO_NOT_ALLOWED | summary.json cache stale（ADR-007） | 等 5 分鐘 cache 過期，或清 Cloudflare cache |
| 前端 Modal 送出後無反應 | JS error（可能是 lazy chunk 404） | 檢查 Network tab，確認 `dist/` 部署完整 |

---

## 11. 災難復原（V1 補充）

### 場景 D：Worker 被誤刪 / Cloudflare account 問題

1. 重新 `wrangler deploy` 即可；Worker code 在本 repo VCS 內
2. `wrangler secret put` 重設兩個 secret
3. 手動觸發 workflow 驗證

### 場景 E：Write PAT 洩漏

1. 立即 revoke
2. Revoke 後訪客寫入全部 fail（回 UPSTREAM_ERROR 或 401）
3. 產生新 PAT，更新 wrangler secret
4. 手動驗證
5. 若 PAT 已被惡意使用：清理 zenbuapps 下異常 issue / comments（可用 `gh api` 或 Octokit 批次刪）

### 場景 F：Turnstile Secret 洩漏

1. 在 Cloudflare Dashboard rotate Secret Key（不影響 Site Key）
2. `wrangler secret put TURNSTILE_SECRET_KEY` 更新
3. 前端不變

---

## 12. CLAUDE.md 需要更新的段落

引入 Worker 後，根目錄 `.claude/CLAUDE.md` 的「專案是什麼」段落需從：

> **沒有 runtime API**。所有 GitHub 資料都在 **build time** 由 `scripts/fetch-data.ts` 抓取…

更新為：

> **唯讀資料來自靜態 JSON**（每小時 cron 由 `scripts/fetch-data.ts` 抓）；**寫入操作**（V1：訪客建立 issue / 留言）透過 **Cloudflare Worker proxy**（`worker/` 子目錄）代理到 GitHub REST API。前端 bundle 不包含寫入 PAT。

此更新由 **planner / implementer** 階段執行，並同步：

- `.claude/rules/data-contract.rule.md`（加上新欄位的演化提示）
- `.claude/skills/zenbu-milestones-dashboard/SKILL.md`（加 Worker 為新路由任務類型）
- `specs/data-pipeline.md`（加入 Worker 作為第三條資料線）
- `specs/information-architecture.md`（反映 UI 變動）

---

## 13. 新依賴套件清單（給 pnpm-and-ci.rule.md）

| 套件 | 類別 | 版本 | 為什麼 |
|------|------|------|--------|
| `@uiw/react-md-editor` | 前端 runtime | latest stable | Markdown 編輯器（ADR-010） |
| `@cloudflare/workers-types` | worker devDependency | 4.x | Worker TS types |
| `wrangler` | worker devDependency | 3.x | Worker CLI |
| `@marsidev/react-turnstile`（可選）| 前端 runtime | latest | Turnstile React wrapper |

**升級規則**：遵循 `.claude/rules/pnpm-and-ci.rule.md` 的「依賴升級節奏」表格。新加入的套件同樣需要在該表補上一列（由 implementer 階段完成）。

**禁止**：在 CI 用 `npm install`；在本地用 `npm install`；產生 `package-lock.json`。
