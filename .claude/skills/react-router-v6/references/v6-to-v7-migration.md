# v6 → v7 migration reference

Extended detail on every future flag and breaking change. The v6 SKILL body summarises these in a table — read this file only if you're actively migrating or debugging a flag-specific issue.

## The future-flags strategy

v7 has **zero breaking changes** if you enable all future flags on v6 first and fix the code they surface. The upgrade order is:

1. Update to latest v6.x
2. Enable flags one at a time, fix resulting warnings/errors, commit, ship
3. Swap packages: `react-router-dom` → `react-router` + `react-router/dom`

## Flag-by-flag

### `v7_relativeSplatPath`

**Behaviour**: Multi-segment splat paths (`"dashboard/*"`) resolve relative links differently.

**Required fix**: Split into parent + splat child.

```tsx
// Before
<Route path="dashboard/*" element={<Dashboard />} />

// After
<Route path="dashboard">
  <Route path="*" element={<Dashboard />} />
</Route>
```

Relative links inside the old splat:
```tsx
<Link to="team">Team</Link>       // before
<Link to="../team">Team</Link>    // after (path resolution changed)
```

### `v7_startTransition`

**Behaviour**: Router state updates use `React.useTransition` instead of `useState`.

**Required fix**: Move `React.lazy(...)` calls to module scope (they must be stable identities).

```tsx
// Broken under v7_startTransition
function MyPage() {
  const Lazy = React.lazy(() => import("./Heavy"));
  return <Lazy />;
}

// Correct
const Lazy = React.lazy(() => import("./Heavy"));
function MyPage() {
  return <Lazy />;
}
```

### `v7_fetcherPersist`

**Behaviour**: Fetcher lifecycle is tied to "idle" state, not component mount. A fetcher may persist briefly after its owner unmounts.

**Required fix**: Usually none. Audit `useFetchers()` consumers — the array may include fetchers whose owner already unmounted.

### `v7_normalizeFormMethod`

**Behaviour**: `formMethod` in `useNavigation()` / `useFetcher()` reports uppercase HTTP methods.

**Required fix**: Update any comparisons.

```ts
// Before
if (navigation.formMethod === "post") { ... }

// After
if (navigation.formMethod === "POST") { ... }
```

### `v7_partialHydration`

**Behaviour**: SSR hydration becomes partial — each route can provide its own hydrate fallback.

**Required fix**: Replace `<RouterProvider fallbackElement={...}>` with per-route `HydrateFallback`.

```tsx
// Before
<RouterProvider router={router} fallbackElement={<GlobalLoading />} />

// After
createBrowserRouter([
  {
    path: "/",
    Component: Root,
    HydrateFallback: GlobalLoading,      // or hydrateFallbackElement: <GlobalLoading />
    children: [...]
  }
]);
<RouterProvider router={router} />
```

### `v7_skipActionErrorRevalidation`

**Behaviour**: After an `action` throws/returns a Response with `4xx`/`5xx`, loaders are **not** revalidated by default.

**Required fix**: Either restructure actions to validate before mutating, or opt in per route via `shouldRevalidate`.

```ts
// Option A — validate first (recommended)
async function action({ request }) {
  const data = await request.formData();
  if (invalid(data)) throw new Response("bad input", { status: 400 });
  await mutate(data); // only runs if validation passed
  return redirect("/ok");
}

// Option B — force revalidation on error
function shouldRevalidate({ actionStatus, defaultShouldRevalidate }) {
  if (actionStatus != null && actionStatus >= 400) return true;
  return defaultShouldRevalidate;
}
```

### `v7_prependBasename`

**Behaviour**: `basename` is automatically prepended to `navigate()`/`Link` paths that start with `/`.

**Required fix**: Remove any manual prepending you did to work around v6's behaviour.

## Deprecated in v6, removed in v7

### `json()` helper

```ts
// v6 (still works)
import { json } from "react-router-dom";
return json({ user }, { status: 200 });

// v7
return { user };                       // for 200 OK
return Response.json({ user });        // for explicit headers/status
throw new Response("Not Found", { status: 404 });  // for errorElement
```

### `defer()` helper

```ts
// v6 (still works)
import { defer } from "react-router-dom";
return defer({ critical: await fetchCritical(), slow: fetchSlow() });

// v7 — return raw object; unresolved promises are auto-deferred
return { critical: await fetchCritical(), slow: fetchSlow() };
```

Consumers still use `<Await>` + `useAsyncValue()` — the consumer API is unchanged.

## Package swap (the final step)

```bash
npm uninstall react-router-dom
npm install react-router@latest
```

Find-and-replace imports:

```bash
# Linux GNU sed
find ./src \( -name "*.tsx" -o -name "*.ts" -o -name "*.jsx" -o -name "*.js" \) \
  -type f -exec sed -i 's|from "react-router-dom"|from "react-router"|g' {} +

# macOS/BSD sed
find ./src \( -name "*.tsx" -o -name "*.ts" -o -name "*.jsx" -o -name "*.js" \) \
  -type f -exec sed -i '' 's|from "react-router-dom"|from "react-router"|g' {} +
```

Then fix DOM-dependent imports that need the deep import:

```ts
// RouterProvider (DOM)
import { RouterProvider } from "react-router/dom";
// non-DOM (tests/SSR)
import { RouterProvider } from "react-router";
```

## Why the migration is worth pre-paying

Each flag you enable on v6 exposes exactly the behaviour change you'd hit on v7. Fixing them while still on v6 lets you ship each fix independently — a week between changes if needed — instead of a Big Bang PR. By the time you swap the package, the only diff is imports.

## Peer dependency bump

v7 requires:
- `node@20` (was `node@18` for v6)
- `react@18` + `react-dom@18` (unchanged from late v6)

CI images and Dockerfiles pinned to Node 18 must bump before the v7 upgrade, or the install will refuse.
