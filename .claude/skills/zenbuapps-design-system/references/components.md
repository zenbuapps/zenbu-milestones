# 元件庫與圖示規範

ZenbuApps 通用 UI 元件規格。所有元件以 Tailwind class 形式提供，可直接套用或抽象成 React component。

---

## 按鈕

```tsx
/* Primary — 主要操作 */
<button className="btn-primary">儲存</button>
/* CSS:
  bg-[--color-brand] text-white font-medium text-sm
  px-4 py-2 rounded-lg flex items-center gap-2
  hover:brightness-110 disabled:opacity-50 transition-colors
*/

/* Secondary — 次要操作 */
<button className="btn-secondary">取消</button>
/* CSS:
  bg-white text-[--color-text-secondary] border border-[--color-border]
  font-medium text-sm px-4 py-2 rounded-lg
  hover:bg-[--color-surface-overlay] transition-colors
*/

/* Ghost — 幽靈按鈕 */
<button className="btn-ghost">查看</button>
/* CSS:
  text-[--color-text-secondary] font-medium text-sm
  px-3 py-1.5 rounded-lg flex items-center gap-2
  hover:bg-[--color-surface-overlay] transition-colors
*/
```

---

## 卡片

```tsx
/* 標準卡片 */
<div className="card p-5">
  內容
</div>
/* CSS:
  bg-white border border-[--color-border] rounded-xl shadow-sm
*/

/* 可點擊卡片 */
<div className="card p-4 hover:shadow-md transition-shadow cursor-pointer">
  內容
</div>
```

---

## Badge / Tag

```tsx
/* 預設 Badge */
<span className="badge">{text}</span>
/* CSS:
  inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
  bg-[--color-surface-overlay] text-[--color-text-muted]
*/

/* 品牌色 Badge */
<span className="badge bg-[--color-primary-50] text-[--color-brand] text-xs">
  系統
</span>

/* 狀態 Badge */
<span className="badge bg-green-50 text-green-600 text-xs">完成</span>
<span className="badge bg-blue-50 text-blue-600 text-xs">進行中</span>
<span className="badge bg-orange-50 text-orange-500 text-xs">逾期</span>
<span className="badge bg-red-50 text-red-500 text-xs">已取消</span>
<span className="badge bg-gray-100 text-gray-500 text-xs">草稿</span>
```

---

## StatCard

```tsx
<div className="card p-5 flex items-center gap-4">
  <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
    {icon}
  </div>
  <div>
    <p className="text-2xl font-semibold text-[--color-text-primary]">{value}</p>
    <p className="text-sm text-[--color-text-secondary]">{label}</p>
    {sub && <p className="text-xs text-[--color-text-muted] mt-0.5">{sub}</p>}
  </div>
</div>
```

---

## Loading Spinner

```tsx
<div className="w-6 h-6 rounded-full border-2 border-[--color-border] border-t-[--color-brand] animate-spin" />
/* sizes: sm=w-4 h-4, md=w-6 h-6 (default), lg=w-10 h-10 */
```

---

## Empty State

```tsx
<div className="flex flex-col items-center justify-center py-16 px-4 text-center">
  <div className="mb-4 text-[--color-text-muted] opacity-40">{icon}</div>
  <h3 className="text-base font-medium text-[--color-text-primary]">{title}</h3>
  {description && (
    <p className="mt-1 text-sm text-[--color-text-secondary] max-w-sm">{description}</p>
  )}
  {action && <div className="mt-4">{action}</div>}
</div>
```

---

## PageHeader

所有頁面頂部統一使用此元件：

```tsx
<div className="flex items-start justify-between px-6 pt-6 pb-4">
  <div>
    <h1 className="text-xl font-semibold text-[--color-text-primary]">{title}</h1>
    {description && (
      <p className="mt-0.5 text-sm text-[--color-text-secondary]">{description}</p>
    )}
  </div>
  {action && <div className="flex-shrink-0 ml-4">{action}</div>}
</div>
```

---

## 圖示規範

> **原則：ZenbuApps 所有產品一律使用 lucide-react 圖示，禁止使用 Emoji。**
>
> Emoji 在不同作業系統和瀏覽器渲染結果不一致，且與設計語言不符。任何需要視覺符號的地方（按鈕、Sidebar、狀態標記、Empty State），都應從 lucide-react 中找對應圖示，不可用 📋 📊 ⚙️ 等 Emoji 替代。

使用 **lucide-react**（目前版本 ^0.500）。

### 圖示尺寸

| 使用情境 | 大小 |
|----------|------|
| Sidebar 導覽圖示 | `size={18}` |
| TopNav 動作圖示（搜尋、通知、登出）| `size={16}` |
| 按鈕內圖示 | `size={15}` 或 `size={16}` |
| PageHeader 按鈕圖示 | `size={16}` |
| 卡片內小圖示 | `size={13}` 或 `size={14}` |
| Empty State 圖示 | `size={48}` |
| Logo 內圖示 | `size={16}` |

> **注意**：`FolderTemplate` 在 v0.500 不存在，改用 `LayoutTemplate`。

### 常用圖示對應

```
總覽 / 儀表板  → LayoutDashboard
員工 / 聯絡人  → Users
部門           → Building2
任務 / 文件    → FileText
日曆 / 行事曆  → Calendar
設定           → Settings
登出           → LogOut
新增           → Plus
搜尋           → Search
篩選           → Filter
儲存           → Save
返回           → ArrowLeft
刪除           → Trash2
編輯           → Edit / PenLine
傳送           → Send
通知           → Bell
LINE 訊息      → MessageSquare
電話           → Phone
Email          → Mail
公司           → Building2
交易 / 金融    → TrendingUp / Briefcase
報表 / 圖表    → BarChart2 / BarChart3
```
