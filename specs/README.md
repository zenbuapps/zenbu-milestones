# specs/ — 規格與契約文件

本專案為 **靜態儀表板**，沒有傳統的「API 規格」或「業務 domain model」。`specs/` 目錄用來記錄 **資料契約、部署契約、視覺資訊架構** 這三類跨時間穩定的規範。

## 目錄內容

| 檔案 | 範疇 | 讀者 |
|---|---|---|
| `data-pipeline.md` | 兩階段資料管線（build-time fetcher + runtime loader）的契約 | 做架構變更的 AI agent / 人類 |
| `json-schema.md` | `public/data/*.json` 的實際 JSON 形狀（以 `src/data/types.ts` 為單一事實來源的說明）| 消費端開發者、除錯時對照 |
| `deployment.md` | GitHub Pages 部署契約（workflow 觸發條件、secret、Pages base path）| DevOps / 首次 setup / 遷移 |
| `information-architecture.md` | 頁面資訊架構與使用者旅程（Overview → Repo Roadmap）| 新增頁面 / 重組 navigation 前 |

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
