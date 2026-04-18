# pnpm & CI Rule

## 核心原則

本專案使用 **pnpm 10.32.1** 作為唯一套件管理器（`package.json::packageManager` 欄位鎖定），並靠 **GitHub Actions 每小時 cron** 自動抓取最新 GitHub 資料並重新部署 GitHub Pages。此流程的三個環節（套件管理、資料抓取、部署）彼此扣合，任一端的變動都要確認另外兩端沒斷。

本 rule 管轄：pnpm 使用、lockfile 維護、GH Actions workflow 契約、Secret 設定。

---

## 強制規範

### 1. 套件管理：只用 pnpm

`package.json::packageManager` 欄位為 `pnpm@10.32.1`。

- **禁用** `npm install`、`yarn install`、`npx`
- Lockfile 是 `pnpm-lock.yaml`；**禁止** commit `package-lock.json` 或 `yarn.lock`
- 新增依賴用 `pnpm add <pkg>` / `pnpm add -D <pkg>`
- CI 跑 `pnpm install --frozen-lockfile`，local 跑 `pnpm install`
- `pnpm` 版本升級時：升 `packageManager` 欄位 + 跑 `pnpm install` 更新 lockfile

如果 dev 機沒裝 pnpm：
```bash
npm install -g pnpm@10.32.1
# or use corepack
corepack enable && corepack prepare pnpm@10.32.1 --activate
```

### 2. Build-time fetch 的環境變數

`scripts/fetch-data.ts` 需要環境變數：

| 變數 | 用途 | 本地 | CI |
|---|---|---|---|
| `GH_TOKEN` | GitHub PAT（讀 org 資料）| 手動 export | `${{ secrets.ZENBU_ORG_READ_TOKEN }}` |

- **本地**：`GH_TOKEN=ghp_xxx pnpm run fetch-data`（bash）或 `$env:GH_TOKEN="ghp_xxx"; pnpm run fetch-data`（PowerShell）
- **CI**：走 `ZENBU_ORG_READ_TOKEN` repo secret → mapping 到 job step env 的 `GH_TOKEN`

#### PAT 權限最小化

`ZENBU_ORG_READ_TOKEN` 必須是 **fine-grained PAT**，對 `zenbuapps` 組織的資源：
- **Repository permissions**：
  - Contents: Read-only
  - Issues: Read-only
  - Metadata: Read-only
- **Repository access**：All repositories under zenbuapps org（或明確列出要覆蓋的 repos）

**禁止** 使用 classic PAT 或任何帶 write 權限的 token。理由：CI 是自動化流程，權限外洩的 blast radius 應最小。

### 3. CI workflow 契約

`.github/workflows/build-and-deploy.yml` 的關鍵設計：

```yaml
on:
  schedule:
    - cron: '0 * * * *'      # 每小時整點（UTC）重抓
  workflow_dispatch:
  push:
    branches: [master]

concurrency:
  group: pages
  cancel-in-progress: false   # 不互踩；排隊等前一個完成

permissions:
  contents: read
  pages: write
  id-token: write
```

修改 workflow 時必須保留：
- **`concurrency: pages` + `cancel-in-progress: false`**：避免兩個 deploy 同時執行互踩 artifact
- **`permissions`** 的三個最小權限（`contents: read` 只為 checkout；`pages: write` + `id-token: write` 為 OIDC 部署）
- **`pnpm/action-setup@v4` + `actions/setup-node@v4` with `cache: pnpm`**：組合順序不能調換（setup-node 要在 pnpm 之後才能偵測到）
- **`actions/configure-pages@v5` with `enablement: true`**：首次執行時自動 enable Pages（見 commit `f0aac6f`）
- **缺 `GH_TOKEN` 的防呆 step**：直接 `exit 1` + `echo "::error::..."`，不要讓 job 安靜地產出空的 `public/data/`

### 4. 部署成功的 Definition of Done

一次成功的 CI 跑完後：
1. GitHub Actions `build` job 與 `deploy` job 都綠燈
2. `https://zenbuapps.github.io/zenbu-milestones/` 可存取
3. 打開後 `summary.json` 載入成功（看得到 StatCard 的數字）
4. 深層連結 `https://zenbuapps.github.io/zenbu-milestones/#/repo/{name}` 可直接開

若任一失敗：先看 Actions log 的 `Fetch zenbuapps org data` step（通常是 PAT 過期 / 權限問題）。

### 5. 本地驗證 workflow 變更

改 workflow 的最小驗證法：

```bash
# 語法檢查（gh CLI 或直接看 Actions UI）
gh workflow view build-and-deploy.yml

# 用 workflow_dispatch 手動跑一次看是否通過
gh workflow run build-and-deploy.yml
gh run watch
```

**不要** 直接 push 一個大改動到 master 測試 —— master push 會觸發 cron 以外的一次 deploy，失敗的話靜態網站會停留在壞掉的狀態直到下一個小時。

---

## Secret 設定 Runbook

### 首次設定 `ZENBU_ORG_READ_TOKEN`

1. 以 zenbuapps org owner 身份登入 GitHub
2. Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token
3. Resource owner：`zenbuapps`
4. Repository access：All repositories
5. Permissions：Contents / Issues / Metadata 全部 Read-only
6. Expiration：建議 90 天（接近過期時用 Actions `schedule` 發通知 / 或設 org-level secret 自動輪替）
7. 在 `zenbu-milestones` repo → Settings → Secrets and variables → Actions → New repository secret
8. Name：`ZENBU_ORG_READ_TOKEN`，Secret：貼上剛產出的 token
9. 手動觸發 workflow 驗證：`gh workflow run build-and-deploy.yml`

### Token 過期處理

- Actions log 會出現 `HttpError: Bad credentials` 或 `401 Unauthorized`
- 依上述步驟產生新 PAT，更新同名 secret
- 重跑一次 workflow

---

## 常見錯誤與修法

### 錯誤：CI 報 `ERROR: GH_TOKEN env var is required`

**原因**：secret 沒設或名字拼錯。

**修法**：確認 repo secrets 有 `ZENBU_ORG_READ_TOKEN`（大小寫敏感），workflow YAML 的 `env.GH_TOKEN` 對到的是它。

### 錯誤：`pnpm install` 報 `Lockfile is up to date, but not matching manifest`

**原因**：本地用 `npm install` 或動手改 `package.json` 沒跑 `pnpm install`。

**修法**：
```bash
rm -rf node_modules
pnpm install
git add pnpm-lock.yaml
git commit -m "chore(deps): sync lockfile"
```

### 錯誤：CI 抓到的 issue / milestone 比實際少

**可能原因**：
1. `p-limit` 太高 → 觸發 secondary rate limit → 部分請求靜靜失敗
2. PAT 缺權限 → 看不到 private repo 的 issue
3. `SENSITIVE_LABELS` 誤排除

**除錯順序**：看 CI log 有無 `✗ {repo} FAILED`（fetch-data 的錯誤處理會 rethrow）、手動測 PAT 權限、檢查 label 設定。

### 錯誤：Pages 404

**可能原因**：
1. Pages 從未啟用 → `configure-pages@v5` 的 `enablement: true` 會自動處理，但只在 org 允許 Pages 時有效
2. `vite.config.ts` 的 `base` 與 repo 名不一致

**修法**：Settings → Pages → Source 設為 `GitHub Actions`（不是 Deploy from branch）。

---

## 依賴升級節奏

| 套件 | 建議節奏 | 注意事項 |
|---|---|---|
| `typescript` | minor 跟、major 手動 | `noUnusedLocals`/`noUnusedParameters` 規則可能更嚴 |
| `vite` | minor 跟、major 看 breaking | 5 → 6 會影響 plugin |
| `react` / `react-dom` | major 手動 | 18 → 19 有 API 變更 |
| `react-router-dom` | **停在 v6.28.x** | v7 有顯著 API 差異，見 `.claude/skills/react-router-v6/` |
| `tailwindcss` | **停在 v3.4.x** | v4 是架構重寫，見 `.claude/skills/tailwindcss-v3/` |
| `@octokit/rest` | minor 跟、major 看 changelog | v21 已是最新，pagination API 穩定 |
| `recharts` | minor 跟 | major 偶爾有 Props 重命名 |
| `lucide-react` | 隨意跟 | 純圖示，影響小 |
| `p-limit` | 不主動升 | 6.x 已夠用 |

升 major 版本時：`pnpm up <pkg>@latest` → `pnpm build` → 手動 `pnpm preview` 檢查 → 看 lib skills 是否需要新版本。
