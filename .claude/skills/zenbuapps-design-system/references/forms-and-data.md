# 表單與資料展示

涵蓋表單元件（Input/Textarea/Select/Label）、資料表格、搜尋列、篩選 Tab、分頁。

---

## 表單設計

### Input 元件

```tsx
/* 標準輸入框 */
<input className="input" />
/* CSS:
  w-full px-3 py-2 text-sm
  border border-[--color-border] rounded-lg
  bg-white text-[--color-text-primary]
  placeholder:text-[--color-text-muted]
  focus:outline-none focus:ring-2 focus:ring-[--color-brand-ring] focus:border-[--color-brand]
  transition-colors
*/

/* Label */
<label className="label">欄位名稱</label>
/* CSS:
  block text-xs font-medium text-[--color-text-muted] mb-1
*/

/* 組合使用 */
<div>
  <label className="label">姓名 *</label>
  <input className="input" placeholder="王小明" />
</div>
```

### Textarea

```tsx
<textarea className="input resize-none h-20" />
```

### Select

```tsx
<select className="input">
  <option value="">請選擇</option>
</select>
```

### 表單佈局

```tsx
/* 雙欄 */
<div className="grid grid-cols-2 gap-4">
  <div><label className="label">名字</label><input className="input" /></div>
  <div><label className="label">姓氏</label><input className="input" /></div>
</div>

/* 單欄 */
<div className="space-y-4">
  <div><label className="label">標題</label><input className="input" /></div>
  <div><label className="label">說明</label><textarea className="input resize-none h-20" /></div>
</div>
```

### 表單 Card 容器

```tsx
<div className="card p-6 space-y-4">
  {/* 表單欄位 */}
  <div className="flex gap-3 pt-2">
    <button className="btn-secondary">取消</button>
    <button className="btn-primary">儲存</button>
  </div>
</div>
```

---

## 資料表格

```tsx
<div className="card overflow-hidden">
  <table className="w-full text-sm">
    <thead>
      <tr className="border-b border-[--color-border] bg-[--color-surface-overlay]">
        <th className="text-left px-5 py-3 text-xs font-semibold text-[--color-text-secondary]">
          欄位名稱
        </th>
      </tr>
    </thead>
    <tbody className="divide-y divide-[--color-border]">
      <tr className="hover:bg-[--color-surface-overlay] transition-colors">
        <td className="px-5 py-3.5 text-sm text-[--color-text-primary]">
          內容
        </td>
      </tr>
    </tbody>
  </table>

  {/* 分頁 */}
  {total > limit && (
    <div className="flex items-center justify-between px-5 py-3 border-t border-[--color-border]">
      <p className="text-xs text-[--color-text-muted]">
        第 {page} 頁，共 {Math.ceil(total / limit)} 頁
      </p>
      <div className="flex gap-2">
        <button onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="btn-secondary text-xs py-1 px-3 disabled:opacity-40">上一頁</button>
        <button onClick={() => setPage(p => p + 1)}
          disabled={page * limit >= total}
          className="btn-secondary text-xs py-1 px-3 disabled:opacity-40">下一頁</button>
      </div>
    </div>
  )}
</div>
```

---

## 篩選 Tab 列

```tsx
<div className="flex items-center gap-1.5 p-1 bg-[--color-surface-overlay] rounded-lg w-fit mb-5">
  {filters.map((f) => (
    <button
      key={f.value}
      onClick={() => setFilter(f.value)}
      className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
        filter === f.value
          ? 'bg-white text-[--color-brand] shadow-sm'
          : 'text-[--color-text-secondary] hover:text-[--color-text-primary]'
      }`}
    >
      {f.label}
    </button>
  ))}
</div>
```

---

## 搜尋列

```tsx
<div className="relative max-w-sm mb-5">
  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[--color-text-muted]" />
  <input
    className="input pl-8 py-1.5 text-xs"
    placeholder="搜尋..."
    value={search}
    onChange={(e) => setSearch(e.target.value)}
  />
</div>
```
