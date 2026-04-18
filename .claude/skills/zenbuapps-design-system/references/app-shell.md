# App Shell：TopNav、Sidebar、Main Content

ZenbuApps 系列產品的標準應用骨架。所有產品的根佈局都遵循此結構。

---

## 標準 App Shell 佈局

```
┌─────────────────────────────────────────────────────────────┐
│  TopNav  h-16  bg-white border-b                           │
│  [Logo][App名]        [模組Tab可選]    [搜尋][通知][用戶]   │
├──────────┬──────────────────────────────────────────────────┤
│ Sidebar  │  Main content area                               │
│ w-[220px]│  bg-[--color-surface]  overflow-y-auto          │
│ bg-white │  p-6                                             │
│ border-r │                                                  │
│          │  (無 max-w 限制，完全全寬)                        │
└──────────┴──────────────────────────────────────────────────┘
```

---

## TopNav 規格

### 標準右側三件套：搜尋 + 通知 + 頭像

ZenbuForm、ZenbuHR 等所有產品採用。

```tsx
<header className="h-16 flex-shrink-0 flex items-center px-4 bg-white border-b border-[var(--color-border)] z-50">
  {/* Logo 區 */}
  <div className="flex items-center gap-2.5 mr-8">
    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-brand)]">
      <Icon size={16} className="text-white" />
    </div>
    <span className="text-base font-bold text-[var(--color-text-primary)]">AppName</span>
  </div>

  {/* 模組 Tab（有多模組時使用，如 ZenbuHR / ZenbuFinance）*/}
  <nav className="flex h-full items-stretch">
    <Link className="flex items-center px-3.5 text-sm font-medium border-b-2 -mb-px
      [active]: text-[--color-brand] border-[--color-brand] font-semibold
      [inactive]: text-[--color-text-muted] border-transparent hover:text-[--color-text-primary]">
      模組名稱
    </Link>
  </nav>

  <div className="flex-1" />

  {/* 右側：搜尋 + 通知 + 頭像（標準三件套）*/}
  <div className="flex items-center gap-2">

    {/* 1. 搜尋按鈕（⌘K 快捷鍵提示）*/}
    <button
      onClick={() => setSearchOpen(true)}
      className="flex items-center gap-2 h-8 px-2.5 border border-[var(--color-border)] rounded-md
                 text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-secondary)]
                 transition-colors"
    >
      <Search size={14} />
      <span className="text-xs hidden sm:inline">搜尋</span>
      <kbd className="text-[10px] hidden sm:inline border border-[var(--color-border)] rounded px-1 py-0.5
                      font-mono text-[var(--color-text-muted)]">⌘K</kbd>
    </button>

    {/* 2. 通知鈴 → Dropdown */}
    <div className="relative" ref={notifRef}>
      <button className="w-8 h-8 border border-[var(--color-border)] rounded-md flex items-center justify-center
                         text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] transition-colors">
        <Bell size={16} />
      </button>
      {/* Dropdown：寬 w-72，rounded-xl，shadow-lg */}
      {notifOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-72 bg-white border border-[var(--color-border)]
                        rounded-xl shadow-lg z-30 overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-surface-overlay)]">
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">通知</span>
          </div>
          {/* 空狀態 */}
          <div className="px-4 py-10 text-center">
            <Bell size={24} className="mx-auto text-[var(--color-border)] mb-2" />
            <p className="text-sm text-[var(--color-text-muted)]">目前沒有通知</p>
          </div>
        </div>
      )}
    </div>

    {/* 3. 頭像 → Profile Dropdown */}
    <div className="relative" ref={profileRef}>
      <button className="w-[30px] h-[30px] rounded-full bg-[var(--color-brand)] flex items-center justify-center
                         text-white text-xs font-semibold hover:opacity-90 transition-opacity">
        {initial}
      </button>
      {/* Dropdown：寬 w-52，顯示帳號資訊 + 登出 */}
      {profileOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-[var(--color-border)]
                        rounded-xl shadow-lg z-30 overflow-hidden">
          {/* 用戶資訊區 */}
          <div className="px-4 py-3 border-b border-[var(--color-surface-overlay)]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[var(--color-brand)] flex items-center justify-center
                              text-white text-xs font-semibold flex-shrink-0">{initial}</div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{user?.name}</p>
                <p className="text-xs text-[var(--color-text-muted)] truncate">{user?.email}</p>
              </div>
            </div>
          </div>
          {/* 登出按鈕（紅色危險操作） */}
          <div className="py-1">
            <button onClick={handleLogout}
              className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-[var(--color-error)]
                         hover:bg-red-50 transition-colors">
              <LogOut size={14} /> 登出
            </button>
          </div>
        </div>
      )}
    </div>
  </div>
</header>
```

### ⌘K 全局快捷鍵綁定

在頂層元件 useEffect：

```ts
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setSearchOpen(o => !o);
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, []);
```

### Dropdown 點外部關閉

兩個 dropdown 各自一個 ref，統一在同一個 mousedown handler 處理：

```ts
useEffect(() => {
  const handler = (e: MouseEvent) => {
    if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
  };
  document.addEventListener('mousedown', handler);
  return () => document.removeEventListener('mousedown', handler);
}, []);
```

> **注意**：兩個 dropdown 互斥，開一個時關掉另一個（`setNotifOpen(o => !o); setProfileOpen(false)`）。

---

## Sidebar 規格

### 單一模組型（如 ZenbuSign / ZenbuCRM）

```tsx
<aside className="w-[220px] flex-shrink-0 flex flex-col bg-white border-r border-[var(--color-border)] overflow-y-auto">
  <nav className="flex-1 px-3 py-4">
    <ul className="space-y-0.5">
      {navItems.map(({ to, icon: Icon, label }) => (
        <NavLink
          to={to}
          className={({ isActive }) => `
            flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13.5px] font-medium transition-colors
            ${isActive
              ? 'bg-[var(--color-primary-50)] text-[var(--color-brand)]'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-overlay)] hover:text-[var(--color-text-primary)]'
            }
          `}
        >
          <Icon size={18} className="flex-shrink-0" />
          {label}
        </NavLink>
      ))}
    </ul>
  </nav>
  {/* 底部：設定 */}
  <div className="p-3 border-t border-[var(--color-border)]">
    <NavLink to="/settings" ...>
      <Settings size={18} /> 設定
    </NavLink>
  </div>
</aside>
```

### 多模組型（如 ZenbuHR / ZenbuFinance）

```tsx
<aside className="w-[220px] ...">
  {groups.map((group) => (
    <div key={group.label} className="mb-1">
      {/* 分類標題 */}
      <div className="text-[11px] font-semibold uppercase tracking-widest text-[--color-text-muted] px-3 pt-3 pb-1">
        {group.label}
      </div>
      {/* 導覽項目 — 同上面的 NavLink 規格 */}
    </div>
  ))}
</aside>
```

---

## Main Content 區域

```tsx
<main className="flex-1 overflow-y-auto bg-[--color-surface] p-6">
  {/* 頁面切換淡入動畫（所有 Power 系列產品標準） */}
  <AnimatePresence mode="wait">
    <motion.div
      key={location.pathname}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <Outlet />
    </motion.div>
  </AnimatePresence>
</main>
```

### 所需 import（Layout component 內）

```tsx
import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

// 在 component 內：
const location = useLocation();
```

### 動畫規則

- `mode="wait"` —— 等舊頁面淡出後才淡入新頁面，避免兩頁重疊。
- `key={location.pathname}` —— 路由一變就觸發動畫。
- `AnimatePresence` 必須在 Router context 內（Layout 本來就在，沒問題）。
- 套件：`framer-motion`（`pnpm add framer-motion`）。
