# specs/ — 規格與契約文件

本專案為 **pnpm monorepo**（前端 React SPA + 後端 NestJS + 共用型別）。`specs/` 目錄用來記錄 **資料契約、API 契約、視覺資訊架構** 這類跨時間穩定的規範，以及歷史功能設計的完整紀錄。

## 目錄內容

| 檔案 / 目錄 | 範疇 | 讀者 |
|---|---|---|
| `data-pipeline.md` | 舊靜態資料管線（build-time fetcher + runtime loader）的契約，過渡期仍在運作 | 做架構變更的 AI agent / 人類 |
| `json-schema.md` | `public/data/*.json` 的實際 JSON 形狀（以 `apps/web/src/data/types.ts` 為單一事實來源）| 消費端開發者、除錯時對照 |
| `information-architecture.md` | 頁面資訊架構與使用者旅程（Overview → Repo Roadmap）| 新增頁面 / 重組 navigation 前 |
| `api/api.yml` | 後端 NestJS REST API 規格（OpenAPI）| 動後端 endpoint / 前端 API client 前 |
| `activities/` | 業務活動建模 | 設計新流程前 |
| `visitor-issue-submission/` | 訪客投稿 issue 功能的完整規格（歷史 + 現況並存；部分 deployment / plan 段落已過時）| 維護此功能時 |
| `clarify/` | 歷史澄清紀錄，反映當時決策，**不是當前狀態** | 回溯決策脈絡 |

> **注意**：舊 `deployment.md` 已於 2026-04-21 隨 GitHub Pages workflow 一併刪除。前端新部署平台遷移計畫待定。

## 與 `.claude/` 的分工

| 位置 | 用途 | 更新頻率 |
|---|---|---|
| `specs/` | **穩定的契約 / 規格** —— 描述「系統的樣子」| 低（architecture 變更才動）|
| `.claude/rules/*.rule.md` | **操作層規範** —— 描述「寫 code 時該怎麼做」 | 中（新工作模式、新反模式）|
| `.claude/skills/zenbu-milestones-dashboard/SKILL.md` | **任務入口索引** —— 根據任務類型路由到對應規範 | 低（只在架構大變動時）|
| `.claude/CLAUDE.md` | **專案總綱** —— 30 秒上手所需的最少資訊 | 低 |
| `serena memories` | AI 擷取式參考資料 | 中 |

## 撰寫原則

1. **描述現況**，不描述未來計畫（那是 issue / PR 的事）
2. **列出契約**，不寫 tutorial（那是 rules / skill 的事）
3. **關鍵邊界條件寫清楚**（空 milestone 的 `completion = 0`、`nextDueMilestone = null`、`SENSITIVE_LABELS` 排除後 issue 數不會變）
4. **每個檔案 < 300 行**，超過就拆
5. **過渡期雙軌並存時明確標注**（例如新舊資料源切換期）
