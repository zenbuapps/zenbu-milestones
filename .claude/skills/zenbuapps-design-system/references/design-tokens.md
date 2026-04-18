# Design Tokens：色彩、排版、間距、互動狀態

ZenbuApps 設計系統的基礎 design tokens。所有 UI 元件都建構在這些 tokens 之上。

---

## 色彩系統

### 方式一：CSS 變數（推薦，支援主題切換）

ZenbuSign / ZenbuCRM 採用此方式。

```css
:root {
  /* Brand */
  --color-brand: #2563eb;          /* Tailwind blue-600 */
  --color-brand-ring: #93c5fd;     /* Focus ring, blue-300 */
  --color-primary-50: #eff6ff;     /* Active nav bg, blue-50 */
  --color-primary-100: #dbeafe;    /* Avatar bg, blue-100 */

  /* Text */
  --color-text-primary: #111827;   /* gray-900, 主文字 */
  --color-text-secondary: #374151; /* gray-700, 次要文字 */
  --color-text-muted: #6b7280;     /* gray-500, 說明文字 */

  /* Surface */
  --color-surface: #f9fafb;        /* gray-50, 頁面背景 */
  --color-surface-overlay: #f3f4f6;/* gray-100, hover/分隔背景 */

  /* Border */
  --color-border: #e5e7eb;         /* gray-200 */

  /* Semantic */
  --color-error: #ef4444;          /* red-500 */
  --color-success: #22c55e;        /* green-500 */
  --color-warning: #f59e0b;        /* amber-500 */

  /* Product-specific */
  --color-line: #06c755;           /* LINE 官方綠 */
}
```

### 方式二：Hardcoded Hex（簡單專案可用）

ZenbuFinance 採用此方式（較輕量，不支援主題切換）。

| 用途 | 值 | Tailwind 對應 |
|------|-----|--------------|
| 主色 | `#2563eb` | `blue-600` |
| 主色淺背景 | `#eff6ff` | `blue-50` |
| 主文字 | `#111827` | `gray-900` |
| 次要文字 | `#374151` | `gray-700` |
| 說明文字 | `#6b7280` | `gray-500` |
| 邊框 | `#e5e7eb` | `gray-200` |
| Hover 背景 | `#f3f4f6` | `gray-100` |
| 頁面背景 | `#f9fafb` | `gray-50` |

### 語意色彩使用規範

| 語意 | 主色 | 文字色 | 背景色 |
|---|---|---|---|
| 成功 | `green-500` | `text-green-600` | `bg-green-50` |
| 警告 | `amber-500` | `text-orange-500` | `bg-orange-50` |
| 錯誤 | `red-500` | `text-red-600` | `bg-red-50` |
| 資訊 | `blue-500` | `text-blue-600` | `bg-blue-50` |

---

## 排版

### 字型

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans TC', sans-serif;
```

### 字級規格

| 用途 | Class | 大小 | 粗細 |
|------|-------|------|------|
| 頁面標題 (H1) | `text-xl font-semibold` | 20px | 600 |
| 區塊標題 (H2) | `text-base font-semibold` | 16px | 600 |
| 子標題 (H3) | `text-sm font-semibold` | 14px | 600 |
| 側欄導覽項目 | `text-[13.5px] font-medium` | 13.5px | 500 |
| 側欄分類標題 | `text-[11px] font-semibold uppercase tracking-widest` | 11px | 600 |
| 一般內文 | `text-sm` | 14px | 400 |
| 表格內文 | `text-sm` | 14px | 400 |
| 次要說明 | `text-xs` | 12px | 400 |
| Label | `text-xs font-medium text-[--color-text-muted]` | 12px | 500 |
| TopNav 標籤 | `text-sm font-medium` | 14px | 500 |
| Logo 文字 | `text-base font-bold` | 16px | 700 |

---

## 間距系統

### 頁面內間距

| 用途 | Class |
|------|-------|
| 頁面外層 padding | `p-6` |
| 頁面 Header 到內容 | `mb-6` 或 `mb-8` |
| 區塊間距 | `space-y-5` 或 `gap-5` |
| 卡片間距 | `gap-4` |
| 表單欄位間距 | `space-y-4` |
| 行內元素間距 | `gap-2` / `gap-3` |

---

## 互動狀態

### Hover

```
一般元素:  hover:bg-[--color-surface-overlay]
按鈕:     hover:brightness-110 (primary) / hover:bg-[--color-surface-overlay] (ghost)
卡片:     hover:shadow-md transition-shadow
表格行:   hover:bg-[--color-surface-overlay] transition-colors
```

### Focus

```
輸入框:   focus:ring-2 focus:ring-[--color-brand-ring] focus:border-[--color-brand]
按鈕:     focus-visible:ring-2 focus-visible:ring-[--color-brand-ring]
```

### Disabled

```
disabled:opacity-50 disabled:cursor-not-allowed
```

### Loading（Pending）

```tsx
<button disabled={mutation.isPending} className="btn-primary">
  {mutation.isPending ? '儲存中...' : '儲存'}
</button>
```

### Active Nav Item

```
bg-[--color-primary-50] text-[--color-brand]
```
