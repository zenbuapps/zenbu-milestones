# Styling System Rule

## 核心原則

本專案使用 **Tailwind 3 + CSS custom properties** 雙層設計系統：CSS 變數定義 design token，Tailwind config 把它們暴露成 utility class，再由 `@layer components` 定義 `.btn-primary`、`.card` 等可重用 class 元件。**新 UI 建構時優先使用這套系統，禁止堆 ad-hoc class**。

本 rule 管轄：顏色 / 字型 / 間距規範、class 元件使用、lucide-react 圖示、響應式斷點、禁用 emoji。

---

## 強制規範

### 1. 顏色：CSS 變數是唯一事實來源

所有顏色定義於 `src/styles/globals.css` 的 `:root`：

```css
:root {
  /* Brand */
  --color-brand: #2563eb;
  --color-brand-ring: #93c5fd;
  --color-primary-50: #eff6ff;
  --color-primary-100: #dbeafe;

  /* Text */
  --color-text-primary: #111827;
  --color-text-secondary: #374151;
  --color-text-muted: #6b7280;

  /* Surface */
  --color-surface: #f9fafb;
  --color-surface-overlay: #f3f4f6;

  /* Border */
  --color-border: #e5e7eb;

  /* Semantic */
  --color-error: #ef4444;
  --color-success: #22c55e;
  --color-warning: #f59e0b;
}
```

透過 `tailwind.config.js` 暴露為 utility：`bg-brand`、`text-text-muted`、`border-border`、`text-error` 等。

#### 使用規則

- **優先使用 utility class**：`bg-brand`、`text-text-secondary`
- **當需要 opacity / 一次性樣式**：用 arbitrary-value 引用 CSS var：`bg-[--color-surface-overlay]`、`ring-4 ring-[--color-surface]`
- **Tailwind v3 語法**：`bg-[--color-foo]`（方括號），**不是** v4 的 `bg-(--color-foo)`（圓括號）
- **禁止** hard-code 色票：`bg-[#2563eb]` 是反模式，改用 `bg-brand`
- **禁止** 使用 Tailwind 預設色系（如 `bg-blue-600`、`text-gray-700`）代替品牌色；但 **例外** 允許用於次要語意色（見下）

#### 允許的 Tailwind 預設色（已在現有元件觀察到）

- `bg-blue-50` / `text-blue-600`：「進行中 milestone」圖示方塊
- `bg-orange-50` / `text-orange-500` / `text-orange-600`：「逾期」警示
- `bg-green-50` / `text-green-600` / `bg-green-500`：「已完成」狀態
- `bg-gray-100` / `text-gray-500` / `bg-gray-300`：「未排程」中性狀態

這些是語意色的補充（狀態 badge / 圖示底色），不替代 design token。新增語意色時優先擴充 `--color-*` 而非新增 Tailwind 色。

### 2. 字型：用系統字 + Noto Sans TC

`tailwind.config.js`：
```js
fontFamily: {
  sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', '"Noto Sans TC"', 'sans-serif'],
},
```

不需要 `@import` 任何 Google Font。Windows/Mac/Linux 上各自找到合適的系統字型，繁體中文落在 Noto Sans TC。

**禁止** 引入其他字型（web font 會拖慢 LCP，對一個進度儀表板不值得）。

### 3. Class 元件優先於 utility 堆疊

`globals.css` 已定義：

| Class | 用途 |
|---|---|
| `.btn-primary` | 主要動作（藍底白字）|
| `.btn-secondary` | 次要動作（白底灰字 + border）|
| `.btn-ghost` | 幽靈按鈕（hover 才有底）|
| `.card` | 白底 + 圓角 + 淺陰影 + border |
| `.label` | 小字灰色 label（表單用）|
| `.input` | 通用輸入框 |
| `.badge` | 圓角小標籤（灰底灰字）|

**使用**：
```tsx
<button className="btn-primary">送出</button>
<div className="card p-5">...</div>
```

**禁止**：複製 class 定義成一串 utility 堆在元件裡。要加新 class 元件 → 加到 `globals.css` 的 `@layer components`。

### 4. 圖示一律用 lucide-react

```tsx
import { ArrowRight, CheckCircle2, Clock } from 'lucide-react';
```

- **常用尺寸**：`size={12-18}`，`strokeWidth={2}` 或 `2.25`
- **禁用 emoji**（❌）：跨平台渲染不一致、與設計語言不符
- **禁止混用其他圖示庫**（heroicons / react-icons / phosphor）—— bundle 會變大且視覺不一致

### 5. 響應式：mobile-first，用既有斷點

- `sm:` (640px)、`md:` (768px)、`lg:` (1024px)、`xl:` (1280px)、`2xl:` (1536px)
- **不要** 自訂斷點，不要用 arbitrary screen（`@[500px]:...`）
- 桌機 / 手機版的分界點目前採用 `md` （Sidebar 在 ≥ md 常駐、< md 為 drawer）

常見 pattern：
```tsx
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
<div className="p-4 sm:p-6">
<h1 className="text-lg sm:text-xl">
```

### 6. 中文文案、zh-Hant

所有使用者可見文字一律繁體中文。

- `aria-label`、`alt`、`title`：也用繁中
- 技術性開發訊息（`console.error`、`[loader] 讀取 X 失敗`）：允許中英混排，保持可除錯
- 日期工具 `formatRelative` 回傳「3 天後」「逾期 2 天」等繁中字串

---

## 常見反模式

### 反模式：堆一坨 utility 定義 button

```tsx
// BAD
<button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2563eb] text-white font-medium text-sm hover:brightness-110 transition-colors">
```

**修法**：
```tsx
<button className="btn-primary">...</button>
```

### 反模式：Tailwind v4 語法

```tsx
// BAD — v4 syntax, silently does nothing in v3
<div className="bg-(--color-surface)">
```

**修法**：
```tsx
<div className="bg-[--color-surface]">
```

### 反模式：用 emoji 當狀態圖示

```tsx
// BAD
<span>✅ 已完成</span>
```

**修法**：
```tsx
import { CheckCircle2 } from 'lucide-react';
<span className="inline-flex items-center gap-1">
  <CheckCircle2 size={12} strokeWidth={2.25} />
  已完成
</span>
```

### 反模式：色票硬編碼於元件

```tsx
// BAD
<div style={{ backgroundColor: '#2563eb' }}>
<div className="bg-[#2563eb]">
```

**修法**：
```tsx
<div className="bg-brand">
<div className="bg-[--color-brand]">
```

---

## 新增 design token 的流程

1. 在 `src/styles/globals.css` 的 `:root` 加 `--color-foo: #xxx`
2. 在 `tailwind.config.js` 的 `theme.extend.colors` 加對應 `foo: 'var(--color-foo)'`
3. 做 `pnpm dev` 確認 utility 生效（Vite HMR 會自動 reload config）
4. 更新本 rule 的「顏色」段落

## 新增 class 元件的流程

1. 確認 utility 無法優雅表達（或超過 3 個 component 重複同一串）
2. 在 `globals.css` 的 `@layer components` 加 `.foo { @apply ... }`
3. 若需要深層 pseudo-class，直接寫原生 CSS：`.foo:hover > .bar { ... }`
4. 更新本 rule 的 class 元件表
