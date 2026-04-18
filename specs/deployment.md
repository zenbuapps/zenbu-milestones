# Deployment Spec

## 部署目標

**GitHub Pages** 的 `zenbuapps/zenbu-milestones` repo Pages，URL 為：

```
https://zenbuapps.github.io/zenbu-milestones/
```

路由採 hash（`#/repo/foo`），深層連結不會 404。

---

## 觸發條件

`.github/workflows/build-and-deploy.yml` 三個觸發點：

| Trigger | 時機 | 用途 |
|---|---|---|
| `schedule: cron '0 * * * *'` | 每小時整點（UTC）| 自動同步 GitHub org 最新資料 |
| `push: branches: [master]` | 推 master | 部署 UI / 架構變更 |
| `workflow_dispatch` | 手動 | 除錯 / PAT 更新後驗證 |

### `concurrency` 設定

```yaml
concurrency:
  group: pages
  cancel-in-progress: false
```

**語意**：同一時間只能有一個 deploy 在跑；後續的會排隊等前一個跑完，**不互相取消**。

**理由**：若兩個 cron 重疊或 push 打到 cron 中段，cancel 會導致部分 fetch 結果被丟棄，使用者會看到不完整的 snapshot。

---

## Pipeline 階段

### Build job

```
checkout ──▶ setup pnpm ──▶ setup Node 20 (cache: pnpm) ──▶ pnpm install --frozen-lockfile
                                                                    │
                         ┌──────────────────────────────────────────┘
                         ▼
         ZENBU_ORG_READ_TOKEN check (missing → exit 1)
                         │
                         ▼
         pnpm run fetch-data (產出 public/data/)
                         │
                         ▼
         actions/configure-pages@v5 with enablement: true
                         │
                         ▼
         pnpm run build (tsc -b + vite build → dist/)
                         │
                         ▼
         actions/upload-pages-artifact@v3 (path: dist)
```

### Deploy job

依賴 `build`，執行 `actions/deploy-pages@v4`，原子切換 production。

**永遠是 atomic**：要嘛新版本完全上線，要嘛失敗保留舊版。不會出現「HTML 是新的但 JS bundle 還是舊的」。

---

## 必備的 Repository Secret

### `ZENBU_ORG_READ_TOKEN`

- 類型：**fine-grained PAT**（禁用 classic PAT）
- Owner：`zenbuapps` org
- Repository access：**All repositories** under zenbuapps
- Permissions：
  - Contents — Read-only
  - Issues — Read-only
  - Metadata — Read-only
- 建議有效期：90 天（接近過期前要人工換 token）

**沒設 / 過期** → workflow 的 `Fetch zenbuapps org data` step 直接 `exit 1` 並印紅色錯誤到 Actions log。

### `GITHUB_TOKEN`（內建）

自動存在，無需設定。`actions/configure-pages` 與 `actions/deploy-pages` 透過 OIDC（`id-token: write` 權限）取得 deploy 權限。

---

## Permissions 契約

```yaml
permissions:
  contents: read    # checkout
  pages: write      # deploy-pages
  id-token: write   # OIDC token for Pages deploy
```

**最小化原則**：這三個是最少所需。任何改動必須先確認是否真的需要（例如：workflow 若要自動 commit lockfile，才需要 `contents: write`）。

---

## Pages 設定

### 首次啟用

`actions/configure-pages@v5` 加 `enablement: true` 會在首次執行時自動啟用 Pages（見 commit `f0aac6f`）。

若 org 政策禁止 Pages / 禁止 PAT：手動到 repo Settings → Pages → Source = GitHub Actions。

### Source 模式

必須是 **「GitHub Actions」** 模式，不是「Deploy from a branch」。

確認方法：
```bash
gh api repos/zenbuapps/zenbu-milestones/pages
# 預期：build_type = "workflow"
```

---

## Vite base 與 Pages sub-path 的關係

| 層 | 配置 | 目前值 |
|---|---|---|
| Vite build | `vite.config.ts::base` | `'/zenbu-milestones/'` |
| HTML 靜態引用 | `index.html::<link rel="icon" href>` | `'/zenbu-milestones/favicon.svg'` |
| SPA 內 fetch | `src/data/loader.ts::resolveDataUrl` | 用 `import.meta.env.BASE_URL` 組路徑 |

**三者必須同步**。詳見 `.claude/rules/vite-base-path.rule.md`。

若 repo 改名 → 三處都要改 → 順手更新此 spec 文字中的 `zenbu-milestones` 字串。

---

## 部署驗證 checklist

```bash
# 1. 檢查最近一次 workflow
gh run list --workflow=build-and-deploy.yml --limit 5

# 2. 手動觸發一次
gh workflow run build-and-deploy.yml
gh run watch

# 3. 線上驗證
curl -s https://zenbuapps.github.io/zenbu-milestones/data/summary.json | head -5

# 4. UI 驗證
# 瀏覽 https://zenbuapps.github.io/zenbu-milestones/
# 確認 StatCard 有數字、RepoCard grid 顯示
# 點進任一 RepoCard，確認深層連結 #/repo/{name} 正常載入
```

---

## 失敗模式與處置

| 症狀 | 可能原因 | 處置 |
|---|---|---|
| Build job 一開始就紅 | PAT 缺 / 過期 | 換 `ZENBU_ORG_READ_TOKEN` |
| `Fetch` step 紅但有抓到部分資料 | secondary rate limit | 降 `p-limit`、或在 CI 加 `@octokit/plugin-throttling` |
| Deploy job 紅 | Pages 未啟用 / org 政策擋 | 手動 Settings → Pages → Source |
| 部署成功但網站載不到 `summary.json` | `public/data/` 沒產出 或被 `.gitignore` 意外擋掉 | `.gitignore` 目前只擋 `public/data/**/*.json`（CI 產物），不影響 build 流程 |
| 深層連結 404 | 改成了 BrowserRouter 但沒解 fallback | 改回 HashRouter（見 `vite-base-path.rule.md`）|
| `base` 不一致 | `vite.config.ts` / `index.html` 不同步 | 同步三處 |

---

## 災難復原

### 場景 A：誤 merge 壞掉的 master

1. `git revert <bad-commit>` → push
2. workflow 會重跑、新 dist 覆蓋舊站
3. 線上自動恢復（最多延遲 5–10 分鐘）

### 場景 B：PAT 洩漏

1. 立即到 GitHub → Settings → Fine-grained tokens → Revoke
2. 重新產生並更新 repo secret
3. 手動觸發 workflow 驗證
4. 如果 token 曾經被寫進 log / commit：聯繫 GitHub Support 要求掃描與清除

### 場景 C：整個 repo 被誤刪

1. GitHub Settings → Repositories → Restore a repository（30 天內可救）
2. 重新建立 PAT + secret
3. 重新 enable Pages（`configure-pages` 會自動處理）
