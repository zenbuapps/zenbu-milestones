# pnpm Rule

## 核心原則

本專案使用 **pnpm 10.32.1** 作為唯一套件管理器（`package.json::packageManager` 欄位鎖定）。lockfile 與 workspace 佈局是多 package（`apps/web`、`apps/api`、`packages/shared`）之間能互相依賴的基礎，任何改動都要同步確認不破壞 workspace 解析。

本 rule 管轄：pnpm 使用、lockfile 維護、依賴升級節奏。

> **注意**：本 rule 原本也涵蓋 GitHub Actions / GitHub Pages 部署流程。該流程已於 2026-04-21 退役（workflow 與 `specs/deployment.md` 一併刪除），前端部署平台遷移計畫另行制定。

---

## 強制規範

### 1. 套件管理：只用 pnpm

`package.json::packageManager` 欄位為 `pnpm@10.32.1`。

- **禁用** `npm install`、`yarn install`、`npx`
- Lockfile 是 `pnpm-lock.yaml`；**禁止** commit `package-lock.json` 或 `yarn.lock`
- 新增依賴用 `pnpm add <pkg>` / `pnpm add -D <pkg>`，記得指定 workspace：`pnpm --filter web add <pkg>` 或 `pnpm --filter api add <pkg>`
- `pnpm` 版本升級時：升 `packageManager` 欄位 + 跑 `pnpm install` 更新 lockfile

如果 dev 機沒裝 pnpm：
```bash
npm install -g pnpm@10.32.1
# or use corepack
corepack enable && corepack prepare pnpm@10.32.1 --activate
```

### 2. Workspace 與建置順序

根 `package.json` 的 `scripts.build` 寫死順序：

```json
"build": "pnpm --filter shared build && pnpm -r --filter \"!shared\" run build"
```

`packages/shared` **必須先打**，因為 `apps/web` 與 `apps/api` 都 `import from 'shared'`，讀的是 `packages/shared/dist/index.mjs`。順序反了 → 編譯找不到型別。

開發時記得：動過 `packages/shared` 的程式碼，要跑 `pnpm build:shared`（或 `pnpm dev:shared` 開 watch），下游 workspace 才拿得到新型別。

### 3. Build-time fetch 的環境變數（過渡期）

> **注意**：`apps/web/scripts/fetch-data.ts` 是舊靜態管線的產物，隨著前端切 API 即將退役。以下規範僅供過渡期本地除錯使用。

`scripts/fetch-data.ts` 需要環境變數：

| 變數 | 用途 | 設法 |
|---|---|---|
| `GH_TOKEN` | GitHub PAT（讀 org 資料）| 手動 export 或放 `.env` |

本地執行：`GH_TOKEN=ghp_xxx pnpm fetch-data`（bash）或 `$env:GH_TOKEN="ghp_xxx"; pnpm fetch-data`（PowerShell）。

PAT 權限最小化：fine-grained PAT 對 `zenbuapps` 組織的 Contents / Issues / Metadata 唯讀。**禁止** 使用 classic PAT 或任何帶 write 權限的 token。

---

## 常見錯誤與修法

### 錯誤：`pnpm install` 報 `Lockfile is up to date, but not matching manifest`

**原因**：本地用 `npm install` 或動手改 `package.json` 沒跑 `pnpm install`。

**修法**：
```bash
rm -rf node_modules
pnpm install
git add pnpm-lock.yaml
git commit -m "chore(deps): sync lockfile"
```

### 錯誤：改過 `packages/shared` 但 `apps/web` / `apps/api` 讀不到新型別

**原因**：`shared` 是透過 `dist/` 被消費的，沒跑 build 下游看不到新 export。

**修法**：
```bash
pnpm build:shared
# 或開 watch 模式
pnpm dev:shared
```

### 錯誤：前端 fetch-data 抓到的 issue / milestone 比實際少

**可能原因**：
1. `p-limit` 太高 → 觸發 secondary rate limit → 部分請求靜靜失敗
2. PAT 缺權限 → 看不到 private repo 的 issue
3. `SENSITIVE_LABELS` 誤排除

**除錯順序**：看 console 有無 `✗ {repo} FAILED`（fetch-data 的錯誤處理會 rethrow）、手動測 PAT 權限、檢查 label 設定。

---

## 依賴升級節奏

| 套件 | 建議節奏 | 注意事項 |
|---|---|---|
| `typescript` | minor 跟、major 手動 | `noUnusedLocals`/`noUnusedParameters` 規則可能更嚴 |
| `vite` | minor 跟、major 看 breaking | 5 → 6 會影響 plugin |
| `react` / `react-dom` | major 手動 | 18 → 19 有 API 變更 |
| `react-router-dom` | **停在 v6.28.x** | v7 有顯著 API 差異 |
| `tailwindcss` | **停在 v3.4.x** | v4 是架構重寫 |
| `@nestjs/*` | minor 跟、major 看 changelog | v11 為目前主線 |
| `@prisma/client` / `prisma` | 雙邊同步升 | 改完 `schema.prisma` 記得 `pnpm prisma:generate` |
| `@octokit/rest` | minor 跟、major 看 changelog | v21 已是最新 |
| `lucide-react` | 隨意跟 | 純圖示，影響小 |

升 major 版本時：`pnpm up <pkg>@latest` → `pnpm build` → 手動 `pnpm preview` 或 `pnpm dev:api` 驗 → 看 skill 是否需要新版本。
