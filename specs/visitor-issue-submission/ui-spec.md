---
version: 0.1.0
date: 2026-04-18
status: draft
depends_on:
  - specs/information-architecture.md
  - .claude/rules/styling-system.rule.md
---

# UI Spec — Visitor Issue Submission

本檔案定義所有 V1 需要新增 / 修改的 UI 元素。遵循 `.claude/rules/styling-system.rule.md` 的強制規範：**使用 CSS 變數 / Tailwind utility / class 元件**，**禁止 ad-hoc color** / **禁止 emoji** / **圖示用 lucide-react** / **所有文案 zh-Hant**。

---

## 1. 元件總覽

| 元件 | 新建 / 修改 | 位置 |
|------|------------|------|
| `VisitorIssueModal` | 新建 | `src/components/Modal/VisitorIssueModal.tsx` |
| `VisitorCommentModal` | 新建 | `src/components/Modal/VisitorCommentModal.tsx` |
| `TurnstileChallenge` | 新建 | `src/components/TurnstileChallenge.tsx` |
| `MediaUploadHint` | 新建 | `src/components/MediaUploadHint.tsx` |
| `Toast` 容器 | 新建（若不存在） | `src/components/Toast/ToastProvider.tsx` |
| `RepoCard` | 修改 | 加「可提交」提示 badge |
| `OverviewPage` | 修改 | 拆兩區塊 |
| `RoadmapPage` | 修改 | 加「建立 issue」按鈕（條件可見） |
| `IssueList` | 修改 | 每 issue 加「留言」按鈕、顯示 type badge |

---

## 2. Modal 基礎規格

### 2.1 排版

- **容器**：`fixed inset-0 z-50 flex items-center justify-center bg-[--color-text-primary]/50`
  - 背景以 `--color-text-primary`（#111827）加 50% opacity 作半透明遮罩
- **Modal 卡片**：`bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 my-8 max-h-[calc(100vh-4rem)] flex flex-col`
- **響應式**：
  - `< 640px`（手機）：`mx-2`（更貼齊邊緣）、`max-h-[calc(100vh-1rem)]`
  - `≥ 640px`：`max-w-2xl`（672px）
- **內部**：
  - Header（h-14，border-b）
  - Body（`flex-1 overflow-y-auto p-5`）
  - Footer（h-14，border-t，action buttons）

### 2.2 開閉動畫

- 開啟：fade-in + scale(0.95 → 1) 200ms ease-out
- 關閉：fade-out + scale(1 → 0.95) 150ms ease-in

使用 CSS transition 即可，不引入新動畫庫。

### 2.3 無障礙

- `role="dialog"` + `aria-modal="true"`
- `aria-labelledby` 指向 Modal 標題元素 id
- ESC 鍵關閉
- Tab 循環焦點鎖定在 Modal 內
- 背景遮罩點擊關閉（帶確認 prompt 若表單已有內容）

### 2.4 Portal

使用 `createPortal(modal, document.body)` render，避免被父容器 `overflow: hidden` 遮蓋。

---

## 3. `VisitorIssueModal`（建立 issue）

### 3.1 結構（由上至下）

```
┌─────────────────────────────────────────────────────┐
│  建立 Issue · <repo-name>                 [X close] │   ← Header
├─────────────────────────────────────────────────────┤
│                                                     │
│  類型                                                │
│  [ Bug ▼ ]                                          │
│                                                     │
│  標題                                                │
│  [____________________________________________]     │
│  (0 / 100 字)                                       │
│                                                     │
│  內容                                                │
│  ┌───────────────────────────────────────────────┐ │
│  │ [B I H ...] [Preview]                          │ │  ← md-editor toolbar
│  │                                                │ │
│  │ ### 舉報聯絡方式                                │ │
│  │ (選填) Email / GitHub handle：                  │ │
│  │                                                │ │
│  │ _______________________________________________│ │
│  └───────────────────────────────────────────────┘ │
│  (50 / 5000 字)                                     │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  ⓘ 媒體上傳                                  │   │  ← MediaUploadHint
│  │  目前暫不支援圖片 / 影片上傳。                  │   │
│  │  請先將媒體上傳至 imgur / YouTube / Gist，      │   │
│  │  再將連結貼入內容中。                           │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  [ Turnstile Widget ]                              │
│                                                     │
├─────────────────────────────────────────────────────┤
│              [ 取消 ]          [ 送出 Issue ]        │   ← Footer
└─────────────────────────────────────────────────────┘
```

### 3.2 欄位規格

| 欄位 | 元件 | 驗證時機 | 錯誤 UI |
|------|------|---------|---------|
| 類型（type） | `<select>` 或 `Combobox` | 送出時 | 紅字下方 |
| 標題（title） | `<input type="text" className="input">` | onChange（即時顯示字數）/ 送出時 | 紅字下方 + 字數變紅 |
| 內容（body） | `@uiw/react-md-editor`（lazy） | onChange（即時顯示字數）/ 送出時 | 紅字下方 + 字數變紅 |
| Turnstile | `TurnstileChallenge` | widget callback | inline 紅字 + reset 按鈕 |

### 3.3 字數計算

- Title：`title.trim().length`（trim 兩端空白後）
- Body：`body.length`（不 trim，保留使用者輸入完整性）
- 字數顯示格式：`({current} / {max} 字)`，當 `current > max` 時整段變 `text-error`

### 3.4 送出按鈕

- **文字**：「送出 Issue」
- **class**：`btn-primary`
- **disabled 條件（其一即 disabled）**：
  - `title.trim().length` 不在 [1, 100]
  - `body.length` 不在 [1, 5000]
  - `type === ''`（若 issue-types.json 非空）
  - Turnstile token 未取得
  - 正在送出中（loading state）

### 3.5 Loading / Success / Error 狀態

| 狀態 | UI |
|------|-----|
| idle | 一般 |
| submitting | 送出按鈕顯示 `Loader2 animate-spin` + 「送出中...」，所有欄位 disabled |
| success | Modal 開啟成功動畫（淡出），關閉後 Toast 顯示 |
| error | 頂部 inline 錯誤提示（靠近 Turnstile widget），根據 error code 顯示對應訊息 |

### 3.6 錯誤文案對照

| `code` | 顯示文案（zh-Hant） |
|--------|-------------------|
| TURNSTILE_FAILED | 驗證失敗，請重新驗證後再試 |
| INVALID_PAYLOAD | 內容不符合要求，請檢查欄位並再試 |
| REPO_NOT_ALLOWED | 此 repo 不接受外部提交 |
| UPSTREAM_ERROR | GitHub 暫時無法處理，請稍後再試 |
| RATE_LIMITED | 已達使用上限，請稍後再試 |
| 其他 | 發生未預期錯誤（代碼 {code}），請稍後再試 |

---

## 4. `VisitorCommentModal`（留言）

### 4.1 結構

與 `VisitorIssueModal` 類似，但**只有 body 欄位 + Turnstile**，沒有 title / type，Markdown 編輯器也不套 body template（空白）。

```
┌─────────────────────────────────────────────────────┐
│  對 #42 留言 · <repo-name>                [X close] │
├─────────────────────────────────────────────────────┤
│                                                     │
│  原 Issue 標題（唯讀，灰字）                          │
│  登入按鈕不動                                        │
│                                                     │
│  留言內容                                            │
│  ┌───────────────────────────────────────────────┐ │
│  │ [md-editor]                                    │ │
│  └───────────────────────────────────────────────┘ │
│  (0 / 5000 字)                                      │
│                                                     │
│  ⓘ 媒體上傳提示                                      │
│                                                     │
│  [ Turnstile Widget ]                              │
│                                                     │
├─────────────────────────────────────────────────────┤
│              [ 取消 ]          [ 送出留言 ]           │
└─────────────────────────────────────────────────────┘
```

### 4.2 送出按鈕

- **文字**：「送出留言」
- **class**：`btn-primary`
- **disabled 條件**：body 長度 不在 [1, 5000] ∨ Turnstile 未通過 ∨ submitting

---

## 5. `TurnstileChallenge` 元件

### 5.1 Props

```tsx
interface TurnstileChallengeProps {
  siteKey: string;              // import.meta.env.VITE_TURNSTILE_SITE_KEY
  onToken: (token: string) => void;
  onError: (code: string) => void;
  onReset?: () => void;         // 外部觸發 reset
}
```

### 5.2 實作選擇

- **優先**：直接 embed Cloudflare 官方 script `https://challenges.cloudflare.com/turnstile/v0/api.js`，用 `window.turnstile.render()` 掛到 div
- **備選**：`@marsidev/react-turnstile` wrapper（若前述不方便）

### 5.3 UI 尺寸

- Managed mode default size（約 300 × 65 px）
- 容器 `flex justify-center my-4`
- 小螢幕下不 scale，讓 widget 自己處理

### 5.4 Reset 機制

外部（例：錯誤處理後）可呼叫 `turnstile.reset(widgetId)`。元件 ref 暴露此方法。

---

## 6. `MediaUploadHint` 元件

### 6.1 樣式

```tsx
<div className="my-3 rounded-lg bg-[--color-surface-overlay] p-3 border border-[--color-border]">
  <div className="flex items-start gap-2">
    <Info size={16} className="mt-0.5 shrink-0 text-text-muted" strokeWidth={2} />
    <div className="text-sm text-text-secondary leading-relaxed">
      <p className="font-medium mb-1">媒體上傳</p>
      <p>
        目前暫不支援圖片 / 影片上傳。請先將媒體上傳至
        <a className="text-brand underline mx-1" href="https://imgur.com" target="_blank" rel="noopener">imgur</a>/
        <a className="text-brand underline mx-1" href="https://youtube.com" target="_blank" rel="noopener">YouTube</a>/
        <a className="text-brand underline ml-1" href="https://gist.github.com" target="_blank" rel="noopener">GitHub Gist</a>，
        再將連結貼入內容中。
      </p>
    </div>
  </div>
</div>
```

### 6.2 不可關閉

V1 不提供「隱藏提示」按鈕（避免使用者錯過資訊）。使用者看多了覺得煩 → 列入 OQ-006。

---

## 7. `RepoCard` 修改

### 7.1 新增「可提交」提示

在 RepoCard 底部（GitHub 按鈕旁）新增一個 badge / 文字提示：

```tsx
{repo.canSubmitIssue === true && (
  <span className="badge inline-flex items-center gap-1 text-brand bg-[--color-primary-50]">
    <MessageSquarePlus size={12} strokeWidth={2.25} />
    可在此建立 issue
  </span>
)}
```

### 7.2 視覺差異

- 色系用 `text-brand` + `bg-[--color-primary-50]`（既有設計 token）
- 圖示 `MessageSquarePlus`（lucide-react）
- 不與現有 private lock、language badge 衝突

---

## 8. `OverviewPage` 修改

### 8.1 結構（新版）

```
PageHeader
StatCard × 4
CompletionBarChart / StatusDonutChart

── 接受訪客提交（N 個）──                            ← 新 section heading
RepoCard grid（canSubmitIssue === true，依原排序）

── 僅供瀏覽（M 個） [▾ 展開]──                       ← 新 collapsible
（預設收合；展開後顯示列表，每項外連 GitHub）
```

### 8.2 分區邏輯

```ts
const submittableRepos = repos.filter(r => r.canSubmitIssue === true);
const browseOnlyRepos  = repos.filter(r => r.canSubmitIssue !== true);
```

### 8.3 Section Heading 樣式

```tsx
<h2 className="text-lg font-semibold text-text-primary mt-8 mb-4 flex items-center gap-2">
  <MessageSquarePlus size={18} strokeWidth={2} className="text-brand" />
  接受訪客提交
  <span className="text-sm font-normal text-text-muted">（{submittableRepos.length} 個）</span>
</h2>
```

### 8.4 「僅供瀏覽」折疊

沿用既有 `Sidebar` 的「其他 repos（無 milestone）」折疊風格保持一致性。

---

## 9. `RoadmapPage` 修改

### 9.1 加入「建立 issue」按鈕

在 PageHeader 的右側 action area 加入：

```tsx
{detail.canSubmitIssue === true && (
  <button
    className="btn-primary inline-flex items-center gap-2"
    onClick={() => setOpenIssueModal(true)}
    aria-label="建立新 Issue"
  >
    <Plus size={16} strokeWidth={2.25} />
    建立 Issue
  </button>
)}
```

> **注意**：`RepoDetail` 目前沒有 `canSubmitIssue` 欄位（只在 `RepoSummary` 有）。這個判斷要從 `AppShell` 的 `Outlet context` 的 summary 拿，或在 RepoDetail 也加欄位（data-contract 層決定，建議：**不加到 RepoDetail，從 context 拿 summary.repos.find(name)**，減少契約面積）。

### 9.2 按鈕位置（響應式）

- `≥ md`：PageHeader 右側、與「開啟 GitHub Repo」並列
- `< md`：堆疊在 PageHeader 下方

---

## 10. `IssueList` 修改

### 10.1 顯示 issue.type badge

每個 issue item 在 title 左邊顯示 type badge（若 type 非 null）：

```tsx
{issue.type && (
  <span className="badge text-xs text-text-secondary bg-[--color-surface-overlay] mr-2">
    {issue.type}
  </span>
)}
```

### 10.2 加「留言」按鈕

issue item 的右側 action area（目前只有 GitHub 外連）加「留言」按鈕：

```tsx
<button
  className="btn-ghost text-xs inline-flex items-center gap-1"
  onClick={() => onCommentClick(issue.number)}
  aria-label={`對 issue #${issue.number} 留言`}
>
  <MessageSquare size={12} strokeWidth={2.25} />
  留言
</button>
```

`onCommentClick` 由父層（RoadmapPage）傳入，負責開 `VisitorCommentModal`。

### 10.3 只在 canSubmitIssue=true 的 repo 顯示

`IssueList` 接受新 prop `canComment: boolean`，由父層決定是否顯示留言按鈕。

---

## 11. Toast 系統

### 11.1 最低實作

若專案尚無 Toast 系統，新建：

```tsx
// src/components/Toast/ToastProvider.tsx
interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  linkUrl?: string;   // 顯示連結（例：GitHub issue URL）
  linkText?: string;
}

// 使用：
const { showToast } = useToast();
showToast({ type: 'success', message: 'issue #42 已建立', linkUrl: '...', linkText: '查看' });
```

### 11.2 樣式

- 位置：`fixed bottom-4 right-4 z-[60]`（在 Modal 之上）
- 尺寸：`max-w-sm rounded-lg shadow-lg bg-white border border-border p-3`
- 類型色：
  - success：左邊綠色 strip + `CheckCircle2`（`text-success`）
  - error：左邊紅色 strip + `AlertCircle`（`text-error`）
  - info：左邊藍色 strip + `Info`（`text-brand`）
- 自動關閉：5 秒（success / info），8 秒（error）
- 可手動點 X 關閉

### 11.3 無障礙

- `role="status"`（success）或 `role="alert"`（error）
- `aria-live="polite"`（success / info）或 `aria-live="assertive"`（error）

---

## 12. 設計 token 追加（若有必要）

檢視既有 `src/styles/globals.css` 的 `--color-*`。**V1 不新增 token**，全部沿用：

- 主色：`--color-brand`（#2563eb）
- 錯誤：`--color-error`
- 成功：`--color-success`
- 提示底色：`--color-surface-overlay`
- 文字主 / 次 / muted：三層現有
- Badge：`.badge` class 元件（globals.css）

**禁止**硬編碼新色票 / 引入新字型 / 新增 emoji。

---

## 13. lucide-react 圖示清單

| 元件 | 圖示 | size |
|------|------|------|
| Close Modal | `X` | 20 |
| 建立 issue 按鈕 | `Plus` | 16 |
| 留言按鈕 | `MessageSquare` | 12 |
| 可提交 badge | `MessageSquarePlus` | 12 |
| 媒體提示 | `Info` | 16 |
| 送出 loading | `Loader2` | 16（加 `animate-spin`）|
| 錯誤訊息 | `AlertCircle` | 16 |
| Toast success | `CheckCircle2` | 16 |
| 展開 / 收合 | `ChevronDown` / `ChevronUp` | 16 |

---

## 14. 鍵盤操作清單

| 動作 | 快捷鍵 |
|------|-------|
| 關閉 Modal | ESC |
| 送出（Modal 內最後一個輸入 focus 時） | `Ctrl/Cmd + Enter` |
| Tab 循環 | Tab / Shift+Tab |
| 折疊區塊展開 / 收合 | Enter / Space（focus 在 trigger 時） |

---

## 15. 與既有 information-architecture.md 的差異摘要

| 頁面 / 區塊 | 既有行為 | V1 新增 |
|------------|---------|---------|
| OverviewPage | 單一 RepoCard grid，全部 active repos | 拆兩區塊（接受提交 / 僅供瀏覽） |
| RoadmapPage PageHeader | 只有「開啟 GitHub Repo」按鈕 | 新增「建立 Issue」按鈕（條件可見） |
| IssueList | 顯示 title / labels / assignees | 新增 type badge、留言按鈕 |
| Toast 系統 | （未知，可能不存在） | 新建或沿用既有 |

此變動需**同步更新** `specs/information-architecture.md`（V2 或同次 PR）。
