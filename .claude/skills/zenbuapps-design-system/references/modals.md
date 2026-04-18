# Modal / Dialog 與 Command Palette

涵蓋一般 Modal 對話框，以及全局搜尋用的 Command Palette（⌘K）。

> Modal 與 Command Palette 是少數例外可以保留 `max-w-*` 的情境。

---

## Modal / Dialog

```tsx
{/* Overlay */}
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
  {/* Dialog Container */}
  <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">

    {/* Header */}
    <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[--color-border]">
      <h2 className="text-base font-semibold text-[--color-text-primary]">標題</h2>
      <button onClick={onClose} className="btn-ghost p-1.5">
        <X size={16} />
      </button>
    </div>

    {/* Body */}
    <div className="p-5 space-y-4">
      {/* 內容 */}
    </div>

    {/* Footer */}
    <div className="flex gap-3 px-5 pb-5">
      <button onClick={onClose} className="btn-secondary flex-1 justify-center">取消</button>
      <button onClick={onSubmit} disabled={isPending} className="btn-primary flex-1 justify-center">
        {isPending ? '處理中...' : '確認'}
      </button>
    </div>
  </div>
</div>
```

### Modal 寬度規範

| 內容複雜度 | max-w |
|------------|-------|
| 簡單確認對話框 | `max-w-sm` |
| 標準表單 Modal | `max-w-md` |
| 複雜表單 | `max-w-lg` |
| 大型內容 | `max-w-2xl` |

---

## Command Palette（全局搜尋）

適用所有具備全局搜尋需求的產品（ZenbuForm、ZenbuHR 等）。

**觸發方式**：⌘K（macOS）/ Ctrl+K（Windows）或點擊 TopNav 搜尋按鈕。

### 視覺規格

- Overlay：`bg-black/40` + `backdrop-filter: blur(4px)`，點外部關閉。
- 卡片：`max-w-lg`、`rounded-2xl`、`shadow-2xl`，位置 `pt-24`（距頂 96px）。
- 輸入框：無邊框，focus 無 outline，placeholder `text-[--color-text-muted]`。
- 結果列表：`max-h-80 overflow-y-auto`。
- Active 項目：`bg-[--color-primary-50]`（跟 nav active 一致）。
- Footer hint：`text-[10px]` 顯示 ↑↓ / Enter / Esc 操作提示。

### 完整實作

```tsx
{/* Overlay */}
<div
  className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4"
  style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
  onClick={onClose}
>
  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
       onClick={e => e.stopPropagation()}>

    {/* 搜尋輸入 */}
    <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)]">
      <Search size={16} className="text-[var(--color-text-muted)] flex-shrink-0" />
      <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
        placeholder="搜尋..."
        className="flex-1 text-sm focus:outline-none bg-transparent" />
      <kbd className="text-[10px] border border-[var(--color-border)] rounded px-1.5 py-0.5 font-mono
                      text-[var(--color-text-muted)]">Esc</kbd>
    </div>

    {/* 結果列表 */}
    <div className="max-h-80 overflow-y-auto py-2">
      {/* 分類標題 */}
      <div className="px-4 py-1.5 text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
        表單（{filtered.length}）
      </div>
      {filtered.map((item, i) => (
        <button key={item.id} onClick={() => go(item)} onMouseEnter={() => setActiveIdx(i)}
          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
            i === activeIdx ? 'bg-[var(--color-primary-50)]' : 'hover:bg-[var(--color-surface)]'
          }`}>
          <FileText size={14} className="text-[var(--color-text-muted)] flex-shrink-0" />
          <span className="flex-1 text-sm truncate">{item.title || '未命名'}</span>
          {/* 狀態 badge */}
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${
            item.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}>{item.status === 'published' ? '發布中' : '草稿'}</span>
        </button>
      ))}
    </div>

    {/* Footer hints */}
    <div className="px-4 py-2 border-t border-[var(--color-border)] flex items-center gap-4 text-[10px] text-[var(--color-text-muted)]">
      <span><kbd className="font-mono">↑↓</kbd> 選擇</span>
      <span><kbd className="font-mono">Enter</kbd> 前往</span>
      <span><kbd className="font-mono">Esc</kbd> 關閉</span>
    </div>
  </div>
</div>
```

### 鍵盤導航 hook（標準實作）

```ts
useEffect(() => {
  if (!open) return;
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && filtered[activeIdx]) go(filtered[activeIdx]);
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, [open, filtered, activeIdx, go, onClose]);
```

### 資料來源策略

開啟時一次性載入所有資料（`api.get('/forms')`），前端 filter，不做 debounce API 搜尋。資料量大時再考慮改為後端搜尋。
