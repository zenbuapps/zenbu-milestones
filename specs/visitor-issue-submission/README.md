---
version: 0.1.0
date: 2026-04-18
status: draft
owner: clarifier agent
related:
  - specs/data-pipeline.md
  - specs/json-schema.md
  - specs/deployment.md
  - specs/information-architecture.md
  - specs/clarify/2026-04-18-1036.md
---

# Visitor Issue Submission — 功能總覽

## 一句話

在 `zenbu-milestones` 儀表板（GitHub Pages 靜態站）上，讓**非 GitHub 登入的訪客**可以直接對 `zenbuapps` 組織旗下的公開 repo 發起「建立 issue」與「留言任何 issue」兩類寫入操作，並同步反映在 GitHub 原生 issue 系統上。

## 為什麼要做

目前儀表板純唯讀，外部使用者看到 milestone / issue 內容後，若想回饋（回報 bug、提新需求、留言追問），必須自行：

1. 登入 GitHub
2. 找到對應 repo
3. 點「New Issue」並填表單

這個摩擦會導致大量有價值的回饋流失。V1 的目標是**把回饋通道開在儀表板內**，訪客無需切換網站或註冊帳號。

## 範圍（In Scope）

| 項目 | 說明 |
|------|------|
| 建立 issue | 訪客在 Modal 內填 title / body / type，送出後於對應 repo 建立 issue |
| 留言 issue | 訪客對任一 milestone 下的現有 issue 新增留言 |
| Turnstile 驗證 | Cloudflare Turnstile Managed widget，Modal 內嵌，inline 錯誤顯示 |
| Markdown 編輯器 | `@uiw/react-md-editor`（含預覽、工具列、GFM 支援） |
| Worker proxy | Cloudflare Worker 作為唯一寫入通道（Turnstile 驗證 + GitHub REST 呼叫） |
| Issue 分類 | 使用 GitHub **Issue Types**（org-level，已於 2024/09 GA）搭配自動附加 `待審核` label |
| UX 同步 | 樂觀更新本地 state；下一小時 fetcher 重跑後以靜態 JSON 為準 |
| OverviewPage 分區 | 依新欄位 `RepoSummary.canSubmitIssue` 拆「接受訪客提交」與「僅供瀏覽」兩區塊 |

## 非範圍（Out of Scope，V1 不做）

| 項目 | 原因 |
|------|------|
| 媒體檔上傳（圖片 / 影片） | 無後端儲存、Worker 不轉存；以教育提示 UI 引導外部上傳（imgur / YouTube / GitHub Gist） |
| 關閉 issue | 保留給 maintainer 用 GitHub 原生 UI，避免被濫用關閉他人 issue |
| 編輯已建立的 issue / 留言 | V1 不做。訪客送出後即失去修改權（符合匿名提交慣例） |
| 訪客帳號系統 / login | 本質是匿名提交；`body template` 的舉報聯絡方式（選填）為唯一識別管道 |
| Private repo 提交 | `canSubmitIssue` V1 規則排除 `isPrivate=true` |
| 無 milestone repo 提交 | `canSubmitIssue` V1 規則排除 `milestoneCount=0`（避免散佈提交入口到大量未維護 repo） |
| 真即時更新（webhooks） | 維持「每小時 cron fetcher」節奏；樂觀更新補足 UX 落差 |
| V2 規劃（Bunny CDN 升級、提交配額管理、IP reputation） | 列入 `open-questions.md` |

## 主要使用者

| Actor | 角色 | 觸發情境 |
|-------|------|---------|
| 訪客（Visitor） | 未登入的瀏覽器使用者 | 讀到感興趣的 repo / milestone / issue，想回饋意見 |
| Maintainer | `zenbuapps` org 成員 | 在 GitHub 原生 UI 上收到 `待審核` label 的新 issue，進行分流 / 合併 / 關閉 |
| CI（GitHub Actions） | 每小時 cron | 照原流程抓資料、產出新 JSON 覆蓋靜態 bundle（訪客新建的 issue 1 小時內反映到儀表板） |
| Cloudflare Worker | `zenbuapps` 自有 Worker | 代理寫入請求、驗 Turnstile、呼叫 GitHub API、回傳結果 |

## 高階架構

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐    ┌──────────────┐
│  Visitor (SPA)  │───▶│ Cloudflare Worker│───▶│  GitHub REST API│    │ GH Actions   │
│  React + MSW    │    │  *.workers.dev   │    │  api.github.com │◀───│  cron fetch  │
│  Turnstile frnt │    │  Turnstile vrfy  │    │                 │    │  每小時      │
└─────────────────┘    └──────────────────┘    └─────────────────┘    └──────┬───────┘
         ▲                                                                    │
         │                        HTTP fetch (public/data/*.json)             │
         └────────────────────────────────────────────────────────────────────┘
                                  static JSON on GitHub Pages
```

**關鍵分工**：
- **前端**：呈現 UI、收集輸入、Turnstile 前端 challenge、樂觀更新本地 state。前端 bundle 絕不包含 write PAT。
- **Worker**：唯一持有 `ZENBU_ORG_WRITE_TOKEN` 的執行環境；驗 Turnstile token → 呼叫 GitHub REST API → 回傳結果。
- **GitHub Actions**：照原流程每小時重抓所有資料產出靜態 JSON，把「訪客新建的 issue」同步到儀表板的靜態狀態。

## 契約影響概覽

此功能會動到本專案以下幾個契約，各自細節見對應 spec 段落：

| 契約 | 變更 | 對應 spec 段落 |
|------|------|---------------|
| `src/data/types.ts` | `IssueLite.type?: string \| null`、`RepoSummary.canSubmitIssue: boolean` | `data-contract.md` |
| `scripts/fetch-data.ts` | 讀 issue.type、計算 canSubmitIssue、可能新增 issue-types.json 產出 | `data-contract.md` |
| `public/data/issue-types.json` | 新增檔案 | `data-contract.md` |
| `.github/workflows/build-and-deploy.yml` | 新增 Worker deploy job（wrangler action） | `deployment.md` |
| 新依賴套件 | `@uiw/react-md-editor`、`@cloudflare/workers-types`、`wrangler` | `deployment.md` |
| `worker/` 新 subdir | 全新 Cloudflare Worker TS code | `architecture.md` |
| CLAUDE.md「沒有 runtime API」描述 | **需更新**（引入 Worker 後不再成立） | `deployment.md` 尾段 |

## 遵循的既有 rules

本 spec 所有決策必須同時滿足：

- `.claude/rules/data-contract.rule.md` — `types.ts` 改動三端同步
- `.claude/rules/vite-base-path.rule.md` — Worker URL / 前端 URL 處理
- `.claude/rules/styling-system.rule.md` — Modal、按鈕、提示 UI 的 UI token
- `.claude/rules/pnpm-and-ci.rule.md` — 新依賴、新 workflow job、新 secrets

## 文件導覽

| 檔案 | 內容 |
|------|------|
| `README.md`（本檔） | 功能總覽、範圍 |
| `requirements.md` | 功能需求（FR）/ 非功能需求（NFR）編號清單 |
| `user-stories.md` | 訪客、maintainer 視角的故事 |
| `acceptance-criteria.md` | Gherkin 格式驗收標準 |
| `architecture.md` | ADR 風格架構決策（候選方案 / 最終選擇 / 理由） |
| `data-contract.md` | types.ts 契約變更、JSON schema、API envelope |
| `ui-spec.md` | Modal 排版、Markdown editor、Turnstile 整合點、教育提示 |
| `deployment.md` | Worker 部署、CI、secrets、CORS |
| `open-questions.md` | 尚未決定但需 planner 階段處理的項目 |
