---
name: tailwindcss-v3
description: API reference and idioms for Tailwind CSS v3 (v3.4.x) — the JavaScript-config era. Use this skill whenever the user is writing, reading, debugging, or migrating code that uses a `tailwind.config.js` file, the `@tailwind base/components/utilities` directives, or utility classes targeting a v3 setup. Also use this when the user mentions v3 vs v4 migration, CSS custom properties exposed as utilities (`bg-brand` → CSS var), arbitrary values like `bg-[--color-surface]`, or asks why a v4 snippet from the modern docs doesn't work in their project — v3 and v4 are architecturally different and snippets do not cross-compile.
---

# Tailwind CSS v3 (v3.4.x)

Authoritative reference for Tailwind v3. The watchword for v3 is **JavaScript-first**: `tailwind.config.js` is the source of truth, and CSS files are plumbing. v4 flipped this (CSS-first via `@theme`), so the two are architecturally different — most v4 snippets will not work in a v3 project. If in doubt, check the **v3 vs v4 cheatsheet** section below before copying anything.

## The `tailwind.config.js` shape

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",             // "media" | "class" | ["class", ".selector"]
  theme: {
    extend: {
      colors: { /* ... */ },
      fontFamily: { /* ... */ },
      spacing: { /* ... */ },
    },
  },
  plugins: [],
  // rarely needed
  prefix: "",                    // e.g. "tw-"
  important: false,              // true or a selector string like "#app"
  separator: ":",                // variant separator
  corePlugins: {},               // disable individual core plugins
  safelist: [],                  // see below
  presets: [],
};
```

**`content`** is the glob list Tailwind scans for class names. Anything not in a scanned file gets purged from the build. Add every path where class strings live — `.html`, `.tsx`, `.vue`, even `.md` if you write Tailwind in MDX.

**`theme` vs `theme.extend`**: top-level keys under `theme` **replace** Tailwind's defaults for that key; keys under `theme.extend` **merge** with defaults. Almost always use `extend` — replacing (say) the whole `colors` map drops every built-in colour utility.

**`darkMode`**:
- `"media"` (default) — uses `prefers-color-scheme`.
- `"class"` — toggles on `<html class="dark">` (the common choice for a theme-switcher).
- `["class", ".theme-dark"]` — use a custom selector.

## The CSS side: directives

```css
/* src/styles/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

/* extend the layers — order matters for specificity */
@layer base {
  h1 { @apply text-2xl font-bold; }
  :root {
    --color-brand: 37 99 235;   /* RGB triplet for alpha support */
    --color-surface: #ffffff;
  }
}

@layer components {
  .btn-primary {
    @apply inline-flex items-center rounded-md bg-brand px-4 py-2 text-white;
  }
}

@layer utilities {
  .scrollbar-hidden::-webkit-scrollbar { display: none; }
}
```

### `@tailwind`
Injects the three layers. These are literal placeholders — Tailwind replaces them with the generated CSS. Order: `base` → `components` → `utilities`.

### `@layer`
Attaches custom CSS to one of the layers so it participates in Tailwind's normal cascade and purging. Custom classes in `@layer` that are never referenced in scanned content files will still be purged (same behaviour as utilities).

### `@apply`
Inlines existing utility classes into hand-written CSS. Use it to build reusable component classes.

```css
.btn-primary {
  @apply rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700;
}
```

**Gotchas**:
- `@apply` drops `!important` — re-add with `@apply ... !important` if you need it.
- Framework single-file-components (Vue, Svelte) can't `@apply` a custom class defined in global CSS — each `<style>` block is isolated. Stick to core utilities, or use the plugin API for custom utilities.
- `@apply hover:bg-red-500` works, but some stacked variants don't — if it fails, write the rule manually.

### `@config`
Point this CSS entry at a different config file. Handy for multi-site monorepos.

```css
@config "./tailwind.marketing.config.js";

@tailwind base;
@tailwind components;
@tailwind utilities;
```

### Functions: `theme()` and `screen()` (inside CSS)

```css
.hero { min-height: calc(100vh - theme(spacing.16)); }
.card { background: theme(colors.blue.500 / 75%); }
@media screen(lg) { /* resolves to @media (min-width: 1024px) */ }
```

Dot notation for nested keys; square brackets for keys with dots (`theme(spacing[2.5])`). `screen(lg)` builds a media query from a named breakpoint.

## Arbitrary values — the fast-path for one-off CSS

```html
<div class="top-[117px] bg-[#bada55] text-[22px]">
<div class="bg-[url('/hero.png')] grid-cols-[1fr_500px_2fr]">
<li class="[mask-type:luminance] hover:[mask-type:alpha]">
<li class="lg:[&:nth-child(3)]:hover:underline">
```

Four flavours:
- **Arbitrary value** — `top-[117px]`, `bg-[#bada55]`: feed any CSS value into a known utility.
- **Arbitrary property** — `[mask-type:luminance]`: a CSS declaration with no utility.
- **Arbitrary variant** — `[&:nth-child(3)]:`: a CSS selector as a variant.
- **Use spaces as underscores** inside arbitrary values: `grid-cols-[1fr_500px_2fr]`. Tailwind converts underscores back to spaces at build time. In URLs, escape with `\_` to keep the underscore.

## Referencing CSS custom properties (the project's idiom)

v3 gives you a shorthand — **you do not need `var(...)`** inside arbitrary-value brackets:

```html
<!-- all three are equivalent in v3 -->
<div class="bg-[--color-surface]">
<div class="bg-[var(--color-surface)]">
<div class="text-[var(--color-text-primary)]">
```

Tailwind auto-wraps the identifier in `var()` when it starts with `--`. This is the mechanism behind patterns like `bg-[--color-surface]` throughout this project's `src/styles/globals.css`.

**Important**: v4 changed this syntax to `bg-(--color-surface)` (parentheses, not brackets). Snippets from the v4 docs will look almost identical but are incompatible with v3 — use `bg-[--...]` here.

## Exposing CSS vars as named utilities (the design-system pattern)

If you define colours as CSS custom properties and want `bg-brand`, `text-brand`, `border-brand` to emit `background-color: var(--color-brand)`, put them under `theme.extend.colors`:

```js
// tailwind.config.js
module.exports = {
  content: [...],
  theme: {
    extend: {
      colors: {
        brand: "var(--color-brand)",
        surface: "var(--color-surface)",
        text: {
          primary: "var(--color-text-primary)",
          muted:   "var(--color-text-muted)",
        },
        error:   "var(--color-error)",
        success: "var(--color-success)",
        warning: "var(--color-warning)",
      },
    },
  },
};
```

```css
/* globals.css */
:root {
  --color-brand: #2563eb;
  --color-surface: #ffffff;
  --color-text-primary: #0f172a;
  --color-text-muted: #64748b;
}
```

Now `<div class="bg-brand text-text-primary">` works — and swapping `:root` vars (light/dark, multi-tenant theming) rethemes the whole app without a rebuild.

### The alpha-modifier caveat

`<alpha-value>` is a Tailwind placeholder that only fires when you supply colour as an RGB triplet (no commas, no `rgb()` wrapper):

```js
// only this form supports bg-brand/50
colors: { brand: "rgb(var(--color-brand) / <alpha-value>)" }
```

```css
:root {
  --color-brand: 37 99 235;  /* space-separated RGB, NOT a hex */
}
```

With this setup, `bg-brand/50` emits `rgba(37 99 235 / 0.5)`. If you set the var as hex (`#2563eb`), `bg-brand/50` silently drops the opacity — you'll need the RGB-triplet form anywhere you want the `/opacity` modifier to work.

Use the simple `"var(--color-brand)"` form when you don't care about the alpha modifier (it's simpler and works for 95% of cases).

## `safelist` — keep classes that never appear in scanned files

Useful for dynamic class names built from data (e.g. `bg-${color}-500` where `color` is runtime-dynamic).

```js
module.exports = {
  safelist: [
    "bg-red-500",
    "bg-green-500",
    {
      pattern: /bg-(red|green|blue)-(100|500|900)/,
      variants: ["hover", "md", "dark"],
    },
  ],
};
```

String entries are exact. Object entries take a regex `pattern` and optional `variants` to keep variant combinations too.

## JIT mode

In v3.0+, **JIT is always on** — the `mode: 'jit'` config option from v2 is gone and has no effect. Classes are generated on-demand from the scanned content, which is why arbitrary values (`top-[117px]`) are free.

## v3 vs v4 cheatsheet (read before pasting anything from the v4 docs)

| Aspect | v3 | v4 |
|---|---|---|
| Configuration | `tailwind.config.js` (JS-first) | `@theme { --color-brand: ... }` in CSS (CSS-first) |
| JS config | Native | Supported only via `@config "../path.js"`; no `corePlugins`, `safelist`, `separator` |
| Imports | `@tailwind base; @tailwind components; @tailwind utilities;` | `@import "tailwindcss";` |
| PostCSS plugin | `tailwindcss` | `@tailwindcss/postcss` (+ no `postcss-import`/`autoprefixer` needed) |
| Vite plugin | none (uses PostCSS) | `@tailwindcss/vite` (preferred over PostCSS) |
| CSS var in arbitrary value | `bg-[--color-brand]` | `bg-(--color-brand)` (brackets → parens) |
| Custom utility | `@layer utilities { .foo { ... } }` | `@utility foo { ... }` |
| Component class | `@layer components { .btn { ... } }` | `@utility btn { ... }` (sorted by specificity) |
| `content` paths | Required | Auto-detected; opt-in override via `@source "./src/**"` |
| Safelist | `safelist: [...]` in config | `@source inline(".btn .card")` in CSS |
| `shadow-sm` / `shadow` | Legacy scale | Renamed: `shadow-xs` / `shadow-sm` (all shadow/blur/rounded shift down one step) |
| `ring` default | 3px blue-500 | 1px currentColor (use `ring-3` for the old visual) |
| `outline-none` | Utility hiding the outline | Literal `outline-style: none`; old behaviour is `outline-hidden` |
| `border` default colour | `gray-200` | `currentColor` (must specify colour explicitly) |
| Opacity utilities | `bg-opacity-50`, `text-opacity-50` | Removed — use `bg-black/50`, `text-black/50` |
| `flex-shrink-*` / `flex-grow-*` | Aliases | Removed — use `shrink-*` / `grow-*` |
| `space-y-*` / `divide-y-*` selector | `:not([hidden]) ~ :not([hidden])` | `:not(:last-child)` (flex+gap preferred) |
| Variant stack order | Right-to-left | Left-to-right (`first:*:pt-0` → `*:first:pt-0`) |
| `!` modifier position | Prefix: `!flex` | Suffix: `flex!` |
| Transform utilities | Composed via `transform` property | Individual properties (reset with `scale-none`, not `transform-none`) |
| `hover` variant | Applies always | Applies only on `(hover: hover)` devices — opt out with `@custom-variant hover (&:hover)` |
| Browser baseline | IE11 lines aside, broad support | Safari 16.4+ / Chrome 111+ / Firefox 128+ (hard requirement) |
| Node baseline | 14+ (upgrade tool needs 20) | 20+ |

Full change-by-change detail: see [references/v3-to-v4-migration.md](references/v3-to-v4-migration.md).

**The trap for AI-written code**: v4 tutorials will show `@theme { --color-brand: ... }` and `bg-(--color-brand)` — both **silently do nothing** in v3. v3 wants `tailwind.config.js` with `colors: { brand: "var(--color-brand)" }` and `bg-[--color-brand]`.

## Quick recipes

### Design-system colours over CSS vars

```css
/* globals.css */
:root {
  --color-brand: #2563eb;
  --color-surface: #ffffff;
  --color-text-primary: #0f172a;
  --color-text-muted: #64748b;
}
```

```js
// tailwind.config.js
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: "var(--color-brand)",
        surface: "var(--color-surface)",
        text: {
          primary: "var(--color-text-primary)",
          muted:   "var(--color-text-muted)",
        },
      },
    },
  },
};
```

```tsx
<button className="bg-brand text-white">
<p className="text-text-muted">
<div className="bg-[--color-surface]">  {/* arbitrary-value escape hatch */}
```

### Reusable class components

```css
@layer components {
  .btn-primary {
    @apply inline-flex items-center justify-center rounded-md bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand/90 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:opacity-50;
  }
  .btn-secondary {
    @apply inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50;
  }
  .card {
    @apply rounded-lg border border-slate-200 bg-white p-6 shadow-sm;
  }
  .input {
    @apply block w-full rounded-md border-slate-300 shadow-sm focus:border-brand focus:ring-brand sm:text-sm;
  }
}
```

Prefer these over class-soup repeated across components. When a design changes, you update one place.

### Dark mode with `darkMode: 'class'`

```js
// tailwind.config.js
module.exports = { darkMode: "class", /* ... */ };
```

```tsx
// toggle
document.documentElement.classList.toggle("dark");

// use
<div className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-50">
```

With CSS vars, flip values in a `.dark` block instead — then every `bg-brand` automatically follows:

```css
:root         { --color-surface: #ffffff; --color-text-primary: #0f172a; }
.dark         { --color-surface: #0f172a; --color-text-primary: #f8fafc; }
```

### Plugin-free responsive patterns

```tsx
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
<div className="text-sm sm:text-base lg:text-lg">
<div className="hidden md:block">{/* show on md+ */}</div>
```

Breakpoint prefixes (`sm:`, `md:`, `lg:`, `xl:`, `2xl:`) are mobile-first — they say "apply at this width *and up*". Override by adding a larger-breakpoint class.
