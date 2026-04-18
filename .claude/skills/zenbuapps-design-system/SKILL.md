---
name: zenbuapps-design-system
description: ZenbuApps 系列產品（ZenbuHR、ZenbuSign、ZenbuCRM、ZenbuFinance、ZenbuForm 等所有 Power 系列）的統一設計系統規範。當任務涉及這些產品的前端 UI 開發、新增頁面、調整 TopNav/Sidebar/Modal/Command Palette、套用色彩或排版規範、實作表單或資料表格、建立列表/詳情/儀表板頁時必須載入。包含 CSS 變數色彩系統、Tailwind class 元件、PageHeader/StatCard/Badge 等元件規格、頁面範本、Auth Token 命名約定。本 skill 採索引式架構：請依任務類型讀取對應的 references/*.md。
---

# ZenbuApps Design System

統一適用於 ZenbuHR、ZenbuSign、ZenbuCRM、ZenbuFinance、ZenbuForm 及後續所有 Power 系列產品的設計規範。

任何 Zenbu 系列前端開發前，先確認任務類型，再讀取對應的 reference 檔案。本 SKILL.md 只放高層原則與索引，避免一次載入過多內容。

---

## 設計哲學

- **一致性優先**：跨產品的視覺語言應高度一致，使用者切換系統時不需重新學習。
- **資訊密度適中**：不過度留白也不過度堆疊，適合商務使用情境。
- **全寬內容**：頁面內容區域不設 `max-w-*` 限制（Modal/Dialog 例外），充分利用螢幕空間。
- **功能優先**：所有視覺設計服務於功能，不為設計而設計。
- **禁用 Emoji**：所有產品一律使用 lucide-react 圖示，禁止使用 Emoji（跨平台渲染不一致、與設計語言不符）。

---

## Reference 索引（依任務類型讀取）

| 任務類型 | 讀取 reference |
|---|---|
| 設定色彩變數、字級、字型、間距、hover/focus/disabled 等互動狀態 | `references/design-tokens.md` |
| 實作或修改 TopNav、Sidebar、Main Content（含 ⌘K 快捷鍵綁定、Dropdown 處理、頁面切換動畫） | `references/app-shell.md` |
| 建立或修改按鈕、卡片、Badge、StatCard、Spinner、Empty State、PageHeader、選用 lucide-react 圖示 | `references/components.md` |
| 撰寫表單（Input/Textarea/Select/Label）、資料表格、搜尋列、篩選 Tab、分頁 | `references/forms-and-data.md` |
| 實作 Modal/Dialog、Command Palette（全局搜尋）、鍵盤導航 | `references/modals.md` |
| 建立列表頁、詳情頁、表單頁、儀表板頁（含完整 React + React Query 範例） | `references/page-templates.md` |
| 串接 API 列表分頁、設定 Auth Token、cookie 命名 | `references/api-conventions.md` |

**判斷原則**：只讀必要的 reference。例如「新增一個按鈕到 PageHeader」只需讀 `components.md`；「建立全新的列表頁」需讀 `page-templates.md` + `forms-and-data.md` + `api-conventions.md`。

---

## 各產品差異對照（快速 lookup）

| 項目 | ZenbuHR | ZenbuSign | ZenbuCRM | ZenbuFinance |
|------|---------|-----------|----------|--------------|
| TopNav 高度 | `h-16` | `h-16` | `h-16` | `h-16` |
| 模組 Tab | 有（5 個模組）| 無 | 無 | 有（5 個模組）|
| Sidebar 寬度 | `220px` 可收合 | `220px` 固定 | `220px` 固定 | `220px` 固定 |
| Sidebar 型態 | 多模組 + 收合 | 單層清單 | 單層清單 | 多分組清單 |
| 色彩系統 | CSS vars + Tailwind | CSS vars | CSS vars | Hardcoded hex |
| 主色 | `blue-600` | `blue-600` | `blue-600` | `#2563eb` |
| 動畫庫 | framer-motion | framer-motion | framer-motion | framer-motion |
| 頁面背景 | `bg-background` | `bg-[--color-surface]` | `bg-[--color-surface]` | `bg-[#fafafa]` |

### 新系統建議採用標準

1. 使用 CSS 變數色彩系統（如 ZenbuSign / ZenbuCRM）。
2. TopNav `h-16` —— 固定高度，不可改變。
3. Sidebar `w-[220px]` —— 一般使用固定寬度，有需求可加收合。
4. Nav items：`text-[13.5px] font-medium py-2.5 gap-3 rounded-lg icon-18`。
5. 頁面 `p-6` 不加 `max-w-*`（Modal 除外）。
6. 統一使用 lucide-react 圖示。

---

## 共通禁區（無論哪種任務都不可違反）

- 禁止使用 Emoji 作為 UI 元素（按鈕、Sidebar、狀態標記、Empty State 一律改用 lucide-react）。
- 禁止對主內容區（非 Modal）加 `max-w-*` 寬度限制。
- 禁止 hard-code 色票於 component 中（應透過 CSS 變數或 Tailwind utility 引用）。
- 禁止跨產品共用 Auth Token key（每個產品獨立 `{prefix}_access_token`，避免互相干擾）。

---

*最後更新：2026-04-04*
*維護者：ZenbuApps Team*
