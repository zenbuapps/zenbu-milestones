# Tailwind v3 → v4 migration reference

Detailed migration guide. The v3 SKILL body summarises these in a table — read this file when the user is actively migrating, or when a v4 snippet they copied isn't working in their v3 project and you need to explain *why*.

## The architectural flip

v3 is **JavaScript-first**: `tailwind.config.js` is the single source of truth for the design system; CSS files just declare layers.

v4 is **CSS-first**: design tokens live in `@theme { --color-brand: ... }` blocks inside CSS; `tailwind.config.js` is optional, loaded only when explicitly referenced via `@config`.

This is the dominant source of confusion when pasting v4 code into a v3 project: the v4 syntax is often silently ignored by v3 because v3 doesn't understand `@theme` or `@import "tailwindcss"`.

## Upgrade tool (if you're actually migrating)

```bash
npx @tailwindcss/upgrade
```

Requires Node 20+. Run on a fresh branch, review diff, test visually, fix the inevitable manual adjustments.

## Entry-point changes

### v3 CSS
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### v4 CSS
```css
@import "tailwindcss";
```

That one line replaces all three directives.

## PostCSS/Vite plugin rename

### v3 `postcss.config.mjs`
```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

### v4 `postcss.config.mjs`
```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

Drop `postcss-import` and `autoprefixer` — v4 handles both internally.

### v4 Vite (preferred over PostCSS)
```ts
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({ plugins: [tailwindcss()] });
```

The Vite plugin has better HMR and is recommended over the PostCSS route for new v4 projects.

### v4 CLI
```bash
# v3
npx tailwindcss -i input.css -o output.css

# v4
npx @tailwindcss/cli -i input.css -o output.css
```

## Configuration migration

### v3 `tailwind.config.js`
```js
module.exports = {
  content: ["./src/**/*.{html,js,tsx}"],
  theme: {
    extend: {
      colors: {
        avocado: {
          100: "oklch(0.99 0 0)",
          200: "oklch(0.98 0.04 113.22)",
        },
      },
    },
  },
};
```

### v4 CSS `@theme` (equivalent)
```css
@import "tailwindcss";

@theme {
  --color-avocado-100: oklch(0.99 0 0);
  --color-avocado-200: oklch(0.98 0.04 113.22);
  --breakpoint-3xl: 120rem;
  --font-display: "Satoshi", "sans-serif";
}
```

Nested v3 colour scales become flat CSS-var names with hyphens. `theme.screens` becomes `--breakpoint-*`. `theme.fontFamily` becomes `--font-*`.

### Keeping v3's JS config during migration

```css
@import "tailwindcss";
@config "../../tailwind.config.js";
```

Limitations of `@config` in v4:
- `corePlugins`, `safelist`, `separator` are **not read**
- Safelisting must move to `@source inline(...)` directives in CSS

## `content` / scanning

v3 required explicit globs:
```js
content: ["./src/**/*.{html,js,tsx}"],
```

v4 auto-detects scan paths using the package layout. Add `@source` in CSS only for non-standard locations:
```css
@source "./legacy/**/*.html";
```

Safelist equivalent:
```css
@source inline(".btn .card .tag-*");
```

## Renamed utilities (the silent breakage)

This table catches most accidental visual breakage when building v3-visuals on v4:

| v3 class | v4 class |
|---|---|
| `shadow-sm` | `shadow-xs` |
| `shadow` | `shadow-sm` |
| `shadow-md` | `shadow-md` (unchanged) |
| `drop-shadow-sm` | `drop-shadow-xs` |
| `drop-shadow` | `drop-shadow-sm` |
| `blur-sm` | `blur-xs` |
| `blur` | `blur-sm` |
| `backdrop-blur-sm` | `backdrop-blur-xs` |
| `backdrop-blur` | `backdrop-blur-sm` |
| `rounded-sm` | `rounded-xs` |
| `rounded` | `rounded-sm` |

Pattern: every step in `{shadow, drop-shadow, blur, backdrop-blur, rounded}` shifts *down* by one — what used to be the default `sm` becomes the new `xs`, what used to be the bare name becomes the new `sm`. Upgrade tool handles this automatically.

## Removed utilities

| v3 | v4 replacement |
|---|---|
| `bg-opacity-*` | `bg-color/50` modifier |
| `text-opacity-*` | `text-color/50` modifier |
| `border-opacity-*` | `border-color/50` modifier |
| `ring-opacity-*` | `ring-color/50` modifier |
| `divide-opacity-*` | `divide-color/50` modifier |
| `placeholder-opacity-*` | `placeholder-color/50` modifier |
| `flex-shrink-*` | `shrink-*` |
| `flex-grow-*` | `grow-*` |
| `overflow-ellipsis` | `text-ellipsis` |
| `decoration-slice` | `box-decoration-slice` |
| `decoration-clone` | `box-decoration-clone` |

## Default-value changes

- **`border`** now defaults to `currentColor`, not `gray-200`. If you relied on the implicit grey, add `border-gray-200` explicitly or restore via a base-layer rule.
- **`ring`** default changed from 3px blue-500 to 1px `currentColor`. Use `ring-3 ring-blue-500` for the old look.
- **`placeholder`** colour defaults to current text colour at 50% opacity, not `gray-400`.
- **Button cursor** changed to `default` (from `pointer`).
- **Dialog** margins reset (v3 had `margin: auto` for centred modals).

Restore any of these with base-layer CSS if needed — the v4 upgrade guide has snippets.

## Directive changes

### Custom utilities
```css
/* v3 */
@layer utilities {
  .tab-4 { tab-size: 4; }
}

/* v4 */
@utility tab-4 {
  tab-size: 4;
}
```

### Component classes
```css
/* v3 */
@layer components {
  .btn { padding: 0.5rem 1rem; }
}

/* v4 */
@utility btn {
  padding: 0.5rem 1rem;
}
```

v4 `@utility` component classes are sorted by specificity and won't be clobbered by regular utilities — v3's `@layer components` approach was looser.

### Custom variants
```css
/* v4 only */
@custom-variant hover (&:hover);   /* restore v3 hover behaviour on touch */
@custom-variant theme-dark (&:where(.dark, .dark *));
```

### `@apply` across isolated `<style>` blocks (Vue/Svelte/CSS modules)
```css
/* v4 */
@reference "../../app.css";

h1 {
  @apply text-2xl font-bold text-red-500;
}
```

v3 didn't need `@reference` — all CSS shared the theme. v4's isolated processing requires explicit import.

## Arbitrary CSS var syntax

```html
<!-- v3 -->
<div class="bg-[--brand-color]">
<div class="bg-[var(--brand-color)]">   <!-- also works in v3 -->

<!-- v4 -->
<div class="bg-(--brand-color)">        <!-- brackets → parens -->
```

This is probably the *most* common paste-from-v4-docs-into-v3 failure mode. The brackets vs parentheses difference is subtle and the v3 engine won't warn — the class just falls through to nothing.

## Commas in arbitrary values

```html
<!-- v3 -->
<div class="grid-cols-[max-content,auto]">

<!-- v4 — commas replaced by underscores -->
<div class="grid-cols-[max-content_auto]">
```

## Variant stacking order

v3 right-to-left, v4 left-to-right.

```html
<!-- v3 -->
<ul class="py-4 first:*:pt-0 last:*:pb-0">

<!-- v4 -->
<ul class="py-4 *:first:pt-0 *:last:pb-0">
```

## `!important` modifier position

```html
<!-- v3 -->
<div class="!bg-red-500 !hover:bg-red-600">

<!-- v4 -->
<div class="bg-red-500! hover:bg-red-600!">
```

## Transform utilities

v3 composed all transforms via the `transform` property. v4 uses individual properties, so `transform-none` doesn't reset rotate/scale/translate any more — use the individual reset (`scale-none`, `translate-none`, `rotate-none`).

```html
<!-- v3 -->
<button class="scale-150 focus:transform-none">

<!-- v4 -->
<button class="scale-150 focus:scale-none">
```

## Transition property lists

```html
<!-- v3 -->
<button class="transition-[opacity,transform] hover:scale-150">

<!-- v4 -->
<button class="transition-[opacity,scale] hover:scale-150">
```

`transform` is no longer the composite property you transition — list the individual subproperty you're actually animating.

## Hover on touch devices

v4 wraps `hover:` in `@media (hover: hover)`, so touch devices don't trigger sticky hover states.

```css
/* restore v3 behaviour */
@custom-variant hover (&:hover);
```

## Prefix syntax

```html
<!-- v3 prefix -->
<div class="tw-flex tw-bg-red-500 tw-hover:bg-red-600">

<!-- v4 prefix — looks like a variant -->
<div class="tw:flex tw:bg-red-500 tw:hover:bg-red-600">
```

Configure v4 prefix in the entry CSS:
```css
@import "tailwindcss" prefix(tw);
```

## Removed features

- **`corePlugins` option** — gone in v4. No replacement.
- **`resolveConfig` function** — gone. Read CSS vars with `getComputedStyle` instead.
- **Container `center` / `padding` options** — gone. Define your own `@utility container`.
- **Preprocessors (Sass/Less/Stylus)** — not supported; v4 expects plain CSS.

## Browser support

v3.4: broad support including older Safari / Edge.
v4.0: requires Safari 16.4+, Chrome 111+, Firefox 128+. This is a hard requirement — v4 depends on `@property`, `color-mix()`, and modern CSS var behaviour.

If you need to support older browsers, **stay on v3.4**. This is a legitimate reason to defer the v4 migration indefinitely.

## Peer bumps

- Node 20+ (v3 tolerated 14+; only the upgrade tool required 20)
- PostCSS config may not even be needed if you switch to the Vite plugin
