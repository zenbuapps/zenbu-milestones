---
name: react-router-v6
description: API reference and code patterns for react-router-dom v6 (specifically v6.28.x). Use this skill whenever the user is writing, reading, debugging, or migrating code that imports from "react-router-dom" v6 — including HashRouter, BrowserRouter, createBrowserRouter, RouterProvider, Outlet, useOutletContext, useParams, useNavigate, useLocation, useSearchParams, Link, NavLink, loaders/actions, errorElement. Also use this whenever the user asks about v6 vs v7 differences, or when a repo's package.json pins `react-router-dom ^6.x` — do NOT let a v7 skill answer v6 questions, the APIs differ in subtle and dangerous ways.
---

# react-router-dom v6 (v6.28.x)

Authoritative API reference for `react-router-dom@^6`. Everything here is what v6 actually ships — v7 renamed/moved/replaced several of these APIs. When in doubt about whether a pattern applies, check the **v6 vs v7 cheatsheet** below first.

## Two routing styles in v6

v6 supports two parallel APIs. Pick one per app — don't mix.

### 1. Declarative (classic, no data APIs)
`<BrowserRouter>` / `<HashRouter>` + `<Routes>` + `<Route>`. Loaders/actions do **not** work here. Use this for static-only sites (e.g. GitHub Pages SPAs), or when you don't need data-router features.

### 2. Data router (v6.4+)
`createBrowserRouter` / `createHashRouter` / `createMemoryRouter` + `<RouterProvider>`. Unlocks `loader`, `action`, `errorElement`, `useRouteError`, `useNavigation`, `useFetcher`, `defer`, `Form`, `useSubmit`, `useRevalidator`.

You can tell which one a codebase uses by looking at the top-level `App.tsx`: if there's a `createBrowserRouter([...])` call, it's a data router.

## HashRouter (relevant for GitHub Pages / static hosts)

```tsx
import { HashRouter, Routes, Route } from "react-router-dom";

<HashRouter basename="/sub">
  <Routes>
    <Route path="/" element={<Home />} />
    <Route path="/about" element={<About />} />
  </Routes>
</HashRouter>
```

Props: `basename?: string`, `children?: ReactNode`, `future?: FutureConfig`, `window?: Window`.

**Why HashRouter**: URLs look like `https://site.com/#/about` — the hash never reaches the server, so the server doesn't need to rewrite unknown paths back to `index.html`. Required when you can't configure the host (GitHub Pages, some S3 setups).

**Gotcha**: SEO-hostile. Analytics tools need to read `location.hash`, not `location.pathname`, to track pageviews properly. `BrowserRouter` is preferred whenever the host can serve `index.html` for unknown paths.

## BrowserRouter

Same props as `HashRouter`. Uses the History API for clean URLs. Requires the server to serve `index.html` for every client-side route.

## createBrowserRouter + RouterProvider (data router)

```tsx
import { createBrowserRouter, RouterProvider } from "react-router-dom";

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <Root />,
      loader: rootLoader,
      errorElement: <RootErrorBoundary />,
      children: [
        { index: true, element: <Home /> },
        { path: "repo/:name", element: <RepoPage />, loader: repoLoader },
      ],
    },
  ],
  {
    basename: "/app",
    future: { v7_startTransition: true, v7_relativeSplatPath: true },
  }
);

<RouterProvider router={router} />;
```

### Signature

```ts
function createBrowserRouter(
  routes: RouteObject[],
  opts?: {
    basename?: string;
    future?: FutureConfig;
    hydrationData?: HydrationState;
    dataStrategy?: DataStrategyFunction;
    patchRoutesOnNavigation?: PatchRoutesOnNavigationFunction;
    window?: Window;
  }
): RemixRouter;
```

### RouteObject shape

```ts
interface RouteObject {
  path?: string;
  index?: boolean;                 // leaf route that renders at parent's path
  element?: React.ReactNode;       // or: Component?: React.ComponentType
  loader?: LoaderFunction;         // runs before render, data via useLoaderData
  action?: ActionFunction;         // runs on <Form> submit / useSubmit
  errorElement?: React.ReactNode;  // or: ErrorBoundary?: ComponentType
  children?: RouteObject[];        // nested routes render in parent's <Outlet />
  handle?: any;                    // per-route metadata, read via useMatches()
  lazy?: LazyRouteFunction;        // code-split a route
  shouldRevalidate?: ShouldRevalidateFunction;
  hydrateFallbackElement?: React.ReactNode;
}
```

`createHashRouter(routes, opts)` has the identical signature — use it when you want data-router features on a hash-based host.

## Outlet + useOutletContext (the main pattern for sharing layout data)

Outlet renders the matched child route inside a parent layout. The `context` prop is the idiomatic way to share parent-scoped data (loaded once, used by many children) without a global store.

```tsx
// Parent layout
import { Outlet } from "react-router-dom";

type TAppShellContext = { summary: Summary };

function AppShell() {
  const summary = useSummary(); // loaded once
  return (
    <div>
      <Header />
      <Outlet context={{ summary } satisfies TAppShellContext} />
    </div>
  );
}

// Child route
import { useOutletContext } from "react-router-dom";

function RepoPage() {
  const { summary } = useOutletContext<TAppShellContext>();
  // ...
}
```

`useOutletContext<T>()` is generic; always pass the context type so children get autocomplete. The value comes through unchanged — no serialization, not limited to JSON — so functions, Maps, class instances all work.

## Hooks reference

### useParams

```ts
function useParams<K extends string = string>(): Readonly<Params<K>>;
```

```tsx
function RepoPage() {
  const { name } = useParams<{ name: string }>();
  // name: string | undefined  ← note: always optional at the type level
  if (!name) return <NotFound />;
  // ...
}
```

**Why `string | undefined`**: the generic describes which keys *might* appear — it does not assert the URL actually matched that path. Narrow with a guard before using.

### useNavigate

```ts
function useNavigate(): NavigateFunction;

interface NavigateFunction {
  (to: To, options?: NavigateOptions): void;
  (delta: number): void;
}

interface NavigateOptions {
  replace?: boolean;
  state?: any;
  relative?: "route" | "path";
  preventScrollReset?: boolean;
  flushSync?: boolean;       // data router only
  viewTransition?: boolean;  // data router only
}
```

```tsx
const navigate = useNavigate();
navigate("/login", { replace: true, state: { from: "/checkout" } });
navigate(-1); // history back
```

Inside a `loader`/`action`, prefer `redirect("/path")` over this hook — it works without React context.

### useLocation

```ts
function useLocation(): Location;

interface Location<State = any> {
  pathname: string;
  search: string;
  hash: string;
  state: State;
  key: string;
}
```

Used for pageview tracking and reading `state` passed via `navigate(to, { state })` / `<Link state={...}>`.

### useSearchParams

```ts
function useSearchParams(
  defaultInit?: URLSearchParamsInit
): [URLSearchParams, SetURLSearchParams];
```

```tsx
const [params, setParams] = useSearchParams();
const sort = params.get("sort") ?? "name";

// functional update (like useState)
setParams((prev) => {
  prev.set("sort", "date");
  return prev;
}, { replace: true });
```

The setter returns `URLSearchParamsInit` — you may mutate `prev` then return it, or build a fresh object.

## Link and NavLink

### Link

```ts
interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  to: string | Partial<Path>;
  replace?: boolean;
  state?: any;
  relative?: "route" | "path";
  reloadDocument?: boolean;     // escape hatch: do a full browser navigation
  preventScrollReset?: boolean;
  viewTransition?: boolean;
}
```

```tsx
<Link to="/repo/foo">foo</Link>
<Link to={{ pathname: "/search", search: "?q=bar" }}>search</Link>
<Link to=".." relative="path">up one path segment</Link>
```

### NavLink

`NavLink` is `Link` + active/pending state. `className`, `style`, and `children` can each be a function of `{ isActive, isPending, isTransitioning }`.

```tsx
<NavLink
  to="/messages"
  className={({ isActive, isPending }) =>
    isPending ? "pending" : isActive ? "active" : ""
  }
>
  Messages
</NavLink>
```

- `end`: match only the exact `to` (so `/tasks` doesn't stay active on `/tasks/123`).
- `caseSensitive`: strict case matching on the path.
- Auto-applies `aria-current="page"` when active — no need to set it yourself.

## errorElement + useRouteError (data router only)

Route-level error boundaries. Errors thrown in a `loader`, `action`, or during render bubble up through nested routes until they hit the nearest `errorElement`.

```tsx
import { useRouteError, isRouteErrorResponse } from "react-router-dom";

function RootErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return <div>{error.status} — {error.statusText}</div>;
  }
  return <div>Unexpected error: {String(error)}</div>;
}
```

**Always put at least one `errorElement` at the root**. The default v6 error screen is developer-oriented and leaks stack traces.

**Throwing from a loader**:

```ts
async function loader({ params }: LoaderFunctionArgs) {
  const res = await fetch(`/api/repos/${params.name}`);
  if (res.status === 404) throw new Response("Not Found", { status: 404 });
  if (!res.ok) throw json({ message: "Failed" }, { status: 500 });
  return res.json();
}
```

`isRouteErrorResponse(error)` is the type guard that distinguishes a thrown `Response`/`json()` from a random `Error`.

## v6 vs v7 cheatsheet (critical — read before copying code from a v7 tutorial)

| Aspect | v6 | v7 |
|---|---|---|
| Package | `react-router-dom` | `react-router` (DOM imports from `react-router/dom`) |
| Import | `from "react-router-dom"` | `from "react-router"` |
| Data return | `json({ ... })` or raw object | **Raw object only**; `json()` is removed |
| `defer()` | Available | Removed — return raw objects with promises |
| Form method case | lowercase `"post"`/`"get"` (unless `v7_normalizeFormMethod`) | Uppercase `"POST"`/`"GET"` |
| Multi-segment splat | `path="dashboard/*"` | Must be split: parent `"dashboard"` + child `"*"` |
| SSR fallback | `<RouterProvider fallbackElement={...} />` | Per-route `HydrateFallback` / `hydrateFallbackElement` |
| Fetcher lifecycle | Cleared on component unmount | Cleared on idle (may outlive component) |
| Action error revalidation | Always revalidate | Skipped on 4xx/5xx unless `shouldRevalidate` opts in |
| Relative splat links | Inside `dashboard/*`, `<Link to="team">` resolves to `/dashboard/team` | Same, but stricter — use `<Link to="../team">` |
| Node requirement | works with Node 18 | Node 20+ |

v6 exposes all the v7 behaviors behind `future` flags — turning them on in v6 is how you pre-pay the migration:

```ts
createBrowserRouter(routes, {
  future: {
    v7_startTransition: true,
    v7_relativeSplatPath: true,
    v7_fetcherPersist: true,
    v7_normalizeFormMethod: true,
    v7_partialHydration: true,
    v7_skipActionErrorRevalidation: true,
  },
});
```

**The trap for AI-written code**: a v7 tutorial will say "return raw objects, don't use `json()`" — in v6.28, `json()` is still the idiomatic way to attach a status code to thrown data for `errorElement` to read. Follow v6 patterns when the project uses v6.

Full migration details: see [references/v6-to-v7-migration.md](references/v6-to-v7-migration.md).

## Quick recipes

### GitHub Pages SPA (no data router)

```tsx
// src/App.tsx
import { HashRouter, Routes, Route } from "react-router-dom";

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<OverviewPage />} />
          <Route path="repo/:name" element={<RoadmapPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
```

`HashRouter` has no `basename` issue on GitHub Pages because everything after `#` is ignored by the host — the Vite `base` handles `/zenbu-milestones/` for asset URLs, and the hash carries the route. Don't set `basename` on `HashRouter` for this case; it's redundant.

### Sharing `summary` from `AppShell` to child routes

```tsx
// AppShell.tsx
type TAppShellContext = { summary: Summary };

export function AppShell() {
  const { summary, loading, error } = useSummary();
  if (loading) return <Loading />;
  if (error) return <ErrorScreen error={error} />;
  return <Outlet context={{ summary } satisfies TAppShellContext} />;
}

// OverviewPage.tsx
export function OverviewPage() {
  const { summary } = useOutletContext<TAppShellContext>();
  return <RepoList repos={summary.repos} />;
}
```

This is the main pattern for sharing top-level loaded data without prop drilling or a global store. It's **only** a parent-to-child channel — siblings can't read each other's context this way.

### Typed params

```tsx
// route: <Route path="/repo/:name" element={<RepoPage />} />
function RepoPage() {
  const { name } = useParams<{ name: string }>();
  if (!name) throw new Error("Route misconfigured: expected :name");
  // ...
}
```

Prefer throwing early over `name!` non-null assertion — the thrown error bubbles to `errorElement` and you get a real stack trace.
