# Vite Base Path Rule

## 核心原則

本專案部署於 GitHub Pages 的 `/zenbu-milestones/` sub-path，**任何 URL 相關的硬編碼都是雷**。所有資源路徑必須透過 `import.meta.env.BASE_URL` 動態組出，**三處**配置（`vite.config.ts` base / `index.html` favicon / `src/data/loader.ts`）必須保持同步。

本 rule 管轄：靜態資源路徑、HashRouter 路由、repo 改名時的同步更新。

---

## 強制規範

### 1. 程式碼中絕不 hard-code `/zenbu-milestones/`

**錯誤**：
```tsx
fetch('/zenbu-milestones/data/summary.json')        // NO
<img src="/zenbu-milestones/logo.png" />            // NO
```

**正確**（對照 `src/data/loader.ts`）：
```ts
const base = import.meta.env.BASE_URL;
const normalizedBase = base.endsWith('/') ? base : `${base}/`;
const url = `${normalizedBase}data/summary.json`;
```

理由：
- `pnpm dev` 時 `BASE_URL` 是 `/`，硬編碼會 404
- 未來 repo 改名時只需改 `vite.config.ts`，不需搜整個 codebase

### 2. 三處配置的同步點

| 檔案 | 要改的地方 | 目前值 |
|---|---|---|
| `vite.config.ts` | `base` 欄位 | `/zenbu-milestones/` |
| `index.html` | `<link rel="icon" href="...favicon.svg">` | `/zenbu-milestones/favicon.svg` |
| `.github/workflows/build-and-deploy.yml` | 無硬編碼（Vite 自動注入） | — |

repo 改名時，**這三處必須一次改完**。`index.html` 是直接被瀏覽器讀的 HTML，Vite 不會改它的 `href` —— 這是唯一合法的硬編碼出現處。

### 3. 路由使用 HashRouter，禁用 BrowserRouter

`src/App.tsx` 使用 `HashRouter`。這是刻意的選擇：

- GitHub Pages 只服務靜態檔案，`BrowserRouter` 在深層連結（如 `/repo/foo`）會被 Pages 當未知路徑回 404
- `HashRouter` 把路由放 URL 的 `#` 之後，Pages server 看不到它

**不要改成 `BrowserRouter`**，除非同時：
1. 換到可設定 SPA rewrite 的部署方案（Vercel / Netlify / Cloudflare Pages）
2. 加入 `_redirects` 或 `404.html` fallback
3. 更新本 rule 與 CLAUDE.md

### 4. Pages base 與 HashRouter 不衝突

`HashRouter` 不需要設 `basename` —— hash 以後的內容在本地瀏覽器解析，完全不經 GitHub Pages。`vite.config.ts` 的 `base: '/zenbu-milestones/'` 只影響靜態資源（JS / CSS / 圖片）的 URL，不干擾路由。

---

## 資源路徑的三種類型

### 類型 A：Vite 管理的資源（自動帶 base）

在 TSX / CSS 裡 `import` 進來的東西，或是 `public/` 底下被 Vite 解析的靜態檔：

```tsx
import logo from './assets/logo.svg';    // 自動帶 base
<link href="/some.css" />                // public/some.css，Vite 自動加 /zenbu-milestones/
```

不需要你管。

### 類型 B：runtime fetch 的 JSON / API

**必須**透過 `import.meta.env.BASE_URL` 組路徑。參考 `src/data/loader.ts::resolveDataUrl` 的實作：

```ts
const resolveDataUrl = (path: string): string => {
  const base = import.meta.env.BASE_URL;
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}data/${path}`;
};
```

這是唯一正確的模式。複製貼上，別自己拼 `/zenbu-milestones/data/${path}`。

### 類型 C：外部 URL

沒有 base 問題，直接硬編碼：

```tsx
<a href="https://github.com/zenbuapps">...</a>
<img src={`https://github.com/${login}.png?size=24`} />
```

---

## 常見錯誤與修法

### 錯誤：寫死 `/zenbu-milestones/` 於 fetch

**症狀**：`pnpm dev` 下資料永遠載不到（走 `http://localhost:5173/zenbu-milestones/data/...`，但 dev server 的 base 是 `/`）。

**修法**：改用 `import.meta.env.BASE_URL`。

### 錯誤：`index.html` 的 favicon 路徑與 `vite.config.ts` 的 base 不一致

**症狀**：部署後 favicon 404。

**修法**：兩處同步。

### 錯誤：把 `HashRouter` 換成 `BrowserRouter`

**症狀**：`/` 能載，但重整 `/repo/foo` 直接 404。

**修法**：改回 `HashRouter`，或換部署平台（見上）。

### 錯誤：`vite preview` 時 URL 漏 base

**症狀**：打開 `http://localhost:4173/` 空白，打開 `http://localhost:4173/zenbu-milestones/` 才正確。

這不是錯誤，是預期行為 —— `vite preview` 會尊重 `base`，正確的本地預覽 URL 是 `http://localhost:4173/zenbu-milestones/`。

---

## 如果 repo 改名了

```bash
# 1. 改 vite.config.ts
base: '/new-name/',

# 2. 改 index.html
<link rel="icon" href="/new-name/favicon.svg">

# 3. GitHub 上 rename repo（會自動重導，但新連結更乾淨）

# 4. 如果有文件 / 外部連結寫到 /zenbu-milestones/，全部更新

# 5. 掃一次殘留引用（使用 aho-corasick 或 Grep）
```

CLAUDE.md 的「部署（`.github/workflows/build-and-deploy.yml`）」段落的範例若提到名字，也要更新。
