# Data Pipeline Spec

> **狀態（2026-04-21）**：舊的「build-time fetcher → 靜態 JSON → SPA runtime loader」兩階段管線已於 Phase 2 完全退役。資料源現為後端 NestJS 的 `DashboardModule`（`apps/api/src/dashboard/`），runtime 呼叫 GitHub REST API 並走 5 分鐘 in-memory TTL cache。

## 當前資料流

```
┌────────────────────┐     Octokit     ┌──────────────────────┐    fetch()+   ┌──────────────────────┐
│  GitHub REST API   │  ─────────────▶ │  NestJS backend      │   session     │  React SPA           │
│  (api.github.com)  │   + p-limit     │  (apps/api)          │   cookie      │  (AppShell +         │
│                    │   + TTL cache   │                      │  ───────────▶ │   RoadmapPage)       │
└────────────────────┘                 └──────────────────────┘               └──────────────────────┘
      來源                                   中繼（cache）                          消費端
```

**關鍵路徑**：
- 後端邏輯：`apps/api/src/dashboard/dashboard.service.ts`
- Cache 層：`apps/api/src/dashboard/dashboard-cache.service.ts`（TTL 5min，prefix delete）
- HTTP controller：`apps/api/src/dashboard/dashboard.controller.ts`
- 前端 client：`apps/web/src/data/api.ts`（`fetchSummary` / `fetchRepoDetail` / `fetchMilestoneIssues`）
- 共用型別：`packages/shared/src/index.ts` 的「Dashboard data」與「Phase 2」sections

## Endpoints

| Method | Path | Auth | Response | TTL |
|---|---|---|---|---|
| `GET` | `/api/summary` | session | `Summary` | 5 min |
| `GET` | `/api/repos/:owner/:name/detail` | session | `RepoDetail` | 5 min |
| `GET` | `/api/repos/:owner/:name/milestones/:number/issues?page=&perPage=` | session | `MilestoneIssuesPage` | 5 min |
| `GET` | `/api/health/github` | public | `GithubHealthStatus` | no cache |
| `POST` | `/api/admin/refresh-data` | admin | `RefreshDataResult` | 10s debounce |

路徑常數定義於 `shared`：`API_PATHS.summary` / `API_PATHS.repoDetail(owner, name)` / …

## 商業規則（delegated to `.claude/rules/data-contract.rule.md`）

- `Milestone.completion` 對空 milestone 回 0（不是 null）
- `Summary.repos` 排序：milestoneCount > 0 優先，同類 `name.localeCompare()`
- `IssueLite.labels[].name` 非空、`.color` 為 6-hex 無 `#`
- SENSITIVE_LABELS（`confidential` / `security` / `internal-only`）過濾 issue 內文但**不**改 milestone 計數
- 過濾 archived / fork 的 repo、過濾 PR

完整契約與變更流程見 `.claude/rules/data-contract.rule.md`。

## 舊管線退役紀錄

退役於 Phase 2（commit 歷史見 `git log --all --oneline`）。移除內容：
- `apps/web/scripts/fetch-data.ts` — build-time fetcher
- `apps/web/scripts/tsconfig.json`
- `apps/web/src/data/loader.ts` — runtime JSON loader
- `apps/web/public/data/` — 靜態 JSON 產出
- `apps/web/package.json` 中 `@octokit/rest` / `p-limit` / `pg` / `@types/pg` / `tsx` 依賴
- 根 / web 的 `fetch-data` script

舊管線的邏輯（SENSITIVE_LABELS 過濾、p-limit 5/8、排序規則、completion 計算）完整搬到 `DashboardService`。
