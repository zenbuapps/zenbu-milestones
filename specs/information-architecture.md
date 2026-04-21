# Information Architecture Spec

## 頁面結構

```
AppShell（唯一的 layout）
├── TopNav（固定頂部，h-16）
│   ├── [手機版] 漢堡鈕 → 開 Sidebar drawer
│   ├── 品牌 logo + "Zenbu Milestones"
│   ├── 最後更新時間（桌機版才顯示）
│   └── "開啟 GitHub Org" 連結
│
├── Sidebar（桌機版常駐左側 w-[220px]，手機版 drawer w-[260px]）
│   ├── "總覽" NavLink → /
│   ├── "Repositories" section
│   │   └── 有 milestone 的 repo × N（字母序）
│   │         - 左：lock icon（if private）+ repo name
│   │         - 右：milestoneCount badge
│   └── "其他 repos（無 milestone）" collapse section
│         └── 無 milestone 的 repo × M（外連到 GitHub，不進 SPA）
│
└── Main Outlet（bg-surface + 捲動）
    ├── / → OverviewPage
    └── /repo/:name → RoadmapPage
```

---

## OverviewPage（`/`）

**用途**：一眼看到整個 org 的 milestone 進度。

### 區塊（由上至下）

#### 1. PageHeader
- 標題「總覽」
- 描述「所有專案的 milestone 進度與 roadmap」

#### 2. StatCard × 4（響應式 1 / 2 / 4 欄）

| StatCard | label | 主值（來源）| sub 文字 | icon | 配色 |
|---|---|---|---|---|---|
| #1 | 活躍 Repos | `totals.repos` | `共 N 個 repositories` | `FolderGit2` | brand 藍 |
| #2 | 進行中 Milestones | `totals.openMilestones` | `已完成 N` | `Clock` | blue-600 |
| #3 | 逾期 Milestones | `totals.overdueMilestones` | 無 | `AlertTriangle` | orange-500（若 > 0 值為紅字）|
| #4 | Open Issues | `totals.openIssues` | `已關閉 N` | `CircleDot` | gray-600 |

#### 3. 圖表 × 2（響應式 1 / 2 欄）

**A. Issue 分布（CompletionBarChart）**
- 堆疊長條圖：每個 repo 一根柱，疊 `open`（藍）+ `closed`（綠）
- X 軸 repo 名（45° 斜角），Y 軸 issue 數
- 手機版加 `overflow-x-auto`，橫向捲動看所有 repo
- 只看 `milestoneCount > 0` 的 repo

**B. Milestone 狀態分布（StatusDonutChart）**
- 4 色甜甜圈：完成（綠）/ 進行中（藍）/ 逾期（橘）/ 未排程（灰）
- 中心顯示總 milestone 數
- **已知精度限制**：summary 層無法區分 in_progress / no_due，此頁的 noDue 固定為 0，未排程靠 RoadmapPage 的 detail 精準分類

#### 4. RepoCard grid（響應式 1 / 2 / 3 欄）

每張卡顯示：
- repo 名 + private lock（若 private）+ language badge
- description（最多 2 行）
- 進度列（`closedMilestoneCount / milestoneCount`）+ `completionRate` 百分比
- 「下一個 milestone」區塊（若 `nextDueMilestone` 不為 null）
- 「N 個 milestone 逾期」警示（若 `overdueCount > 0`）
- 底部：「查看 Roadmap」（SPA 內連）+ "GitHub"（外連）

**空狀態**：若沒有任何 active repo → `EmptyState` + `Inbox` 圖示 + 提示「當 org 底下的 repo 建立了 milestone 後，會自動出現在這裡」

---

## RoadmapPage（`#/repo/:name`）

**用途**：看單一 repo 的 milestone 時間線與其下 issue 完成狀態。

### 載入狀態
- 載入中 → `LoadingSpinner size="lg"` 置中
- 錯誤（通常是 404：該 repo 無 milestone，沒有 detail 檔）→ `EmptyState` + 返回按鈕
- 空（該 repo 無 milestone，但 detail 檔竟存在）→ `EmptyState` + 提示建立 milestone

### 區塊（由上至下）

#### 1. 返回按鈕
`btn-ghost` + `ArrowLeft` 圖示，導回 `/`

#### 2. PageHeader
- 標題：repo 名 + lock icon（若 private）
- 描述：repo description（若有）
- 右側動作：「開啟 GitHub Repo」按鈕（`btn-secondary`）

#### 3. 資訊列（2×2 grid on mobile / 1×4 on desktop）
| 欄位 | 值 |
|---|---|
| 語言 | `detail.language ?? '—'` |
| 最後更新 | `formatDate(detail.updatedAt)` |
| 總 Milestones | `detail.milestones.length` |
| 完成率 | `Math.round(closedMilestoneCount / total * 100)%` |

#### 4. MilestoneTimeline
垂直時間軸。每個節點 `MilestoneNode`：
- 左側狀態圓點（依 `deriveMilestoneStatus` 四色）
- 右側卡片：milestone 標題（外連 GitHub）+ StatusBadge + 日期文字 + description + ProgressBar + 展開按鈕
- **預設展開**：`pickDefaultExpanded` 優先序 = 最近 in_progress > 第一個 overdue > 第一個
- 展開後顯示 `IssueList`（issue 標題、labels、assignees 頭像）

### 排序規則
- 有 `dueOn` 的 milestone 依 `dueOn` 升序
- 無 `dueOn` 的放最後，依 `createdAt` 降序（最新建的在前）

---

## 使用者旅程

### Journey 1：組織管理者的晨間 check-in
1. 打開儀表板首頁（部署 URL 依平台而定）
2. 看 StatCard：今日有幾個逾期？
3. 看 StatusDonutChart：整體進度分布
4. 若有逾期 → 從 Sidebar 或 RepoCard 的警示進去看具體哪些 milestone
5. 點進 RoadmapPage 看具體 issue

### Journey 2：PM 追蹤單一專案進度
1. 直接用書籤開 `<DASHBOARD_ROOT>/#/repo/foo`（hash router）
2. RoadmapPage 直接載入該 repo 的 timeline
3. 展開 in_progress milestone 看 issue 細節
4. 點 issue 外連到 GitHub 處理

### Journey 3：新 repo 加入組織
1. CI 下一次整點 cron 會重抓、包含新 repo
2. Sidebar 自動出現新 repo（若有 milestone → 主列表；若無 → 收摺區）
3. 使用者無需手動動作

---

## 新增頁面 / 區塊的準則

### 何時加新 StatCard？
- 新指標必須是 **全 org 層級** 才放 OverviewPage
- 資料必須已在 `Summary.totals`，或同步 `data-contract.rule.md` 的流程新增欄位
- 視覺保持 4 欄或擴展為 2×4，不要奇數

### 何時加新圖表？
- 只有真正有資訊價值、能指導行動的才加
- 優先用 Recharts（已在 bundle）而非新圖表庫
- 手機版務必 `overflow-x-auto` 或設計為自適應

### 何時加新頁面？
- 必須是 OverviewPage / RoadmapPage 之外的全新視角（例：按 assignee 看、按 label 看）
- 加進 `src/App.tsx` 路由，更新 Sidebar 的主 NavLink
- 更新本 spec、資料管線若有新需求同步更新契約

### 何時動 AppShell / Sidebar / TopNav？
- 審慎：三者是跨頁共用，改動影響所有頁面
- 優先走 `zenbuapps-design-system` skill 的規範（統一設計語言）
- 手機版 drawer / 桌機版常駐的切換點是 `md`（768px），不要改
