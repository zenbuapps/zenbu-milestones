---
name: octokit-rest-v21
description: API reference and production patterns for @octokit/rest v21 — the official GitHub REST client for Node.js. Use this skill whenever the user is writing, reviewing, or debugging code that imports from "@octokit/rest", hits api.github.com, or deals with GitHub primary/secondary rate limits, pagination across endpoints (repos/issues/milestones/pulls), or the throttling/retry plugins. Also use this for any build-time GitHub data-fetching script (CI jobs, static-site generators, dashboards) where hitting rate limits will break the build — the difference between a job that completes in 30 seconds and one that gets 403'd for 10 minutes is usually pagination strategy and concurrency control.
---

# @octokit/rest v21

Authoritative reference for `@octokit/rest@^21` — the GitHub REST API client. v21's core API is stable with v20; the important knowledge is not the constructor shape (small) but **pagination, rate limits, and concurrency control** (large, subtle, failure-prone).

## Installation and import

```ts
import { Octokit } from "@octokit/rest";
```

ESM only in modern versions. The package includes types; no separate `@types/*` needed.

## Constructor

```ts
const octokit = new Octokit({
  auth: process.env.GH_TOKEN,         // PAT, installation token, or JWT
  userAgent: "my-app v1.0.0",         // required by GitHub; identify yourself
  baseUrl: "https://api.github.com",  // change for GitHub Enterprise Server
  timeZone: "America/Los_Angeles",
  request: {
    timeout: 10_000,                  // per-request timeout in ms
    fetch,                            // supply a custom fetch (undici, etc.)
    signal: abortController.signal,   // abort support
  },
  log: { debug, info, warn, error },  // optional logger
});
```

All options are optional. Unauthenticated gets you 60 req/hour — authenticate even for read-only public data.

## Authentication patterns

### Personal Access Token (most scripts)
```ts
const octokit = new Octokit({ auth: process.env.GH_TOKEN });
```
Fine-grained PATs are preferred over classic PATs. For org-wide read access, the PAT needs repository permissions scoped to the org.

### GitHub App installation (rate-limit ceiling: 15k/hr per installation)
```ts
import { createAppAuth } from "@octokit/auth-app";

const octokit = new Octokit({
  authStrategy: createAppAuth,
  auth: {
    appId: 12345,
    privateKey: process.env.APP_PRIVATE_KEY!,
    installationId: 67890,
  },
});
```

### GitHub Actions default token
```ts
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
// 1000 req/hour per repository — usually plenty for per-repo workflows
```

## Making requests

Two equivalent forms:

```ts
// 1. Typed method form — preferred, gets autocomplete + param validation
const { data } = await octokit.rest.repos.listForOrg({
  org: "zenbuapps",
  per_page: 100,
});

// 2. Raw endpoint form — for unmapped/preview endpoints
const { data } = await octokit.request("GET /orgs/{org}/repos", {
  org: "zenbuapps",
  per_page: 100,
});
```

Every call resolves to `{ data, status, headers, url }`. Errors throw a `RequestError` (instance check via `error.name === "HttpError"` or `error.status`).

```ts
import { RequestError } from "@octokit/request-error";

try {
  await octokit.rest.repos.get({ owner, repo });
} catch (e) {
  if (e instanceof RequestError && e.status === 404) return null;
  throw e;
}
```

## The endpoints this codebase uses

### `GET /orgs/{org}/repos` — list org repos

```ts
octokit.rest.repos.listForOrg({
  org,
  type: "all",           // "all" | "public" | "private" | "forks" | "sources" | "member"
  sort: "full_name",     // "created" | "updated" | "pushed" | "full_name"
  direction: "asc",
  per_page: 100,         // max 100
  page: 1,
});
```

Returns minimal repository objects:
```ts
{
  name: string,
  full_name: string,       // "owner/name"
  description: string | null,
  archived: boolean,       // filter these out unless you want historical
  disabled: boolean,
  fork: boolean,           // filter these out unless you want forks
  default_branch: string,
  visibility: "public" | "private" | "internal",
  private: boolean,
  // ...
}
```

### `GET /repos/{owner}/{repo}/issues` — list issues

```ts
octokit.rest.issues.listForRepo({
  owner,
  repo,
  milestone: "*",        // number | "*" (any) | "none" — filter
  state: "all",          // "open" | "closed" | "all"
  assignee: "*",         // username | "none" | "*"
  labels: "bug,ui",      // comma-separated
  sort: "created",       // "created" | "updated" | "comments"
  direction: "desc",
  since: "2025-01-01T00:00:00Z",
  per_page: 100,
  page: 1,
});
```

**Critical gotcha — PRs are issues**: every pull request shows up in this endpoint as an issue. Filter them out by checking `issue.pull_request`:

```ts
const realIssues = response.data.filter((issue) => !issue.pull_request);
```

`issue.pull_request` is `undefined` on true issues and an object `{ url, html_url, diff_url, patch_url }` on PRs.

### `GET /repos/{owner}/{repo}/milestones` — list milestones

```ts
octokit.rest.issues.listMilestones({
  owner,
  repo,
  state: "all",          // "open" | "closed" | "all"
  sort: "due_on",        // "due_on" | "completeness"
  direction: "asc",
  per_page: 100,
});
```

Response:
```ts
{
  number: number,          // use this as the `milestone` filter on issues
  title: string,
  description: string | null,
  state: "open" | "closed",
  due_on: string | null,   // ISO 8601
  open_issues: number,     // counted by GitHub — no need to tally yourself
  closed_issues: number,
  created_at: string,
  updated_at: string,
  closed_at: string | null,
  url: string,
  html_url: string,
}
```

Completion ratio is `closed_issues / (open_issues + closed_issues)`. Guard against zero:
```ts
const total = m.open_issues + m.closed_issues;
const completion = total === 0 ? 0 : m.closed_issues / total;
```

## Pagination — the make-or-break topic

Without pagination, `listForOrg` returns at most `per_page` records (default 30, max 100). For any org with >100 repos, or any repo with >100 issues, you will miss data silently unless you paginate.

### `octokit.paginate(endpoint, params?, mapFn?)` — returns a flat array

```ts
const allRepos = await octokit.paginate(
  octokit.rest.repos.listForOrg,     // typed reference
  { org, type: "all", per_page: 100 }
);
// allRepos: Repo[]  (every page concatenated)
```

Always pass `per_page: 100`. The default of 30 triples the number of round trips you make.

`paginate` can also take a string endpoint:
```ts
const allIssues = await octokit.paginate(
  "GET /repos/{owner}/{repo}/issues",
  { owner, repo, state: "all", per_page: 100 }
);
```

### `octokit.paginate.iterator(...)` — async iterator

Use this when you want to process pages one-at-a-time (memory-bounded, or you need to break early):

```ts
for await (const { data: page } of octokit.paginate.iterator(
  octokit.rest.issues.listForRepo,
  { owner, repo, state: "all", per_page: 100 }
)) {
  for (const issue of page) {
    if (issue.title.includes("URGENT")) {
      return issue;  // early exit, no more pages fetched
    }
  }
}
```

### Map function (transform + early terminate)

```ts
const titles = await octokit.paginate(
  octokit.rest.issues.listForRepo,
  { owner, repo, per_page: 100 },
  (response, done) => {
    // If you find what you need, stop fetching
    if (response.data.some((i) => i.number === 42)) done();
    return response.data.map((i) => i.title);  // flatten into the result
  }
);
```

`done()` stops pagination **after** the current page is included. Useful for "find first" patterns.

## Rate limits — the two kinds, handled differently

### Primary rate limit (the "budget")

| Auth | Hourly budget |
|---|---|
| Unauthenticated | 60 |
| Authenticated user (PAT) | 5,000 |
| GitHub App installation | 15,000 |
| OAuth App (Enterprise Cloud) | 15,000 |
| `GITHUB_TOKEN` in Actions | 1,000 per repo |
| Search endpoints | 30 per minute (separate bucket) |

Every response includes:
```
x-ratelimit-limit: 5000
x-ratelimit-remaining: 4872
x-ratelimit-used: 128
x-ratelimit-reset: 1713456000     // epoch seconds, UTC
x-ratelimit-resource: core        // core | search | graphql | integration_manifest
```

When `remaining === 0`, you get `403 Forbidden` with a `retry-after` header (or you can compute wait time from `x-ratelimit-reset`).

### Secondary rate limit (the "burst" guard) — the dangerous one

Separate, undocumented-precisely thresholds that trigger **without warning** when your request pattern looks abusive. GitHub triggers secondary limits on:

- **>100 concurrent requests** — no matter how small the budget
- **>900 "points per minute"** for REST (reads cost ~1 point; writes 5)
- **>90 seconds of CPU time per 60 seconds of real time** on their servers
- **>80 content-generating (POST/PATCH/PUT) requests per minute**

Response is `403` or `429` with body `"You have exceeded a secondary rate limit"`. Includes `retry-after` you *must* respect — retrying sooner can get your token banned.

**Key insight**: your primary budget might say you have 4,500 requests left, and you'll still trip secondary limits if you fire 200 of them in parallel. Primary budget is about the hour; secondary is about the shape of your traffic within any given minute.

## Strategies for staying under secondary limits

### Pattern 1 — bounded concurrency with `p-limit`

The idiomatic Node solution. Cap fan-out at a small number (5–10) and per-repo work at a slightly higher number (8–15).

```ts
import pLimit from "p-limit";

const repoLimit = pLimit(5);    // at most 5 repos being processed concurrently
const issueLimit = pLimit(8);   // within each repo, at most 8 issue pages fetching

const results = await Promise.all(
  repos.map((repo) =>
    repoLimit(async () => {
      const milestones = await octokit.paginate(
        octokit.rest.issues.listMilestones,
        { owner, repo: repo.name, state: "all", per_page: 100 }
      );

      const issuesByMilestone = await Promise.all(
        milestones.map((m) =>
          issueLimit(() =>
            octokit.paginate(octokit.rest.issues.listForRepo, {
              owner,
              repo: repo.name,
              milestone: String(m.number),
              state: "all",
              per_page: 100,
            })
          )
        )
      );

      return { repo, milestones, issuesByMilestone };
    })
  )
);
```

Why two limiters? `repoLimit` caps the number of repos being processed at once (outer fan-out). `issueLimit` caps the number of issue-list calls regardless of which repo they belong to — without it, 5 repos × 20 milestones each = 100 parallel requests, straight into the concurrent-request ceiling.

Tuning: start conservative (5/8), raise only if the job is too slow and you're not tripping limits. Anything above 10 outer / 20 inner is asking for trouble.

### Pattern 2 — `@octokit/plugin-throttling` (automatic retry)

Official plugin that queues requests and automatically retries after `retry-after`. Complements `p-limit` (doesn't replace it — the plugin won't help you avoid getting rate-limited in the first place, only recover from it).

```ts
import { Octokit } from "@octokit/rest";
import { throttling } from "@octokit/plugin-throttling";

const ThrottledOctokit = Octokit.plugin(throttling);

const octokit = new ThrottledOctokit({
  auth: process.env.GH_TOKEN,
  throttle: {
    onRateLimit: (retryAfter, options, octokit, retryCount) => {
      octokit.log.warn(`Hit primary limit on ${options.method} ${options.url}`);
      if (retryCount < 2) return true;  // retry up to 2 times
    },
    onSecondaryRateLimit: (retryAfter, options, octokit) => {
      octokit.log.warn(`Hit secondary limit on ${options.method} ${options.url}`);
      return true;  // always retry secondary — respects retry-after
    },
  },
});
```

Return `true` from the callback to let the plugin retry after `retryAfter` seconds. Return `false`/`undefined` to give up.

### Pattern 3 — `@octokit/plugin-retry` (transient errors)

Separate plugin that retries on 5xx and network errors. Safe to combine with throttling.

```ts
import { retry } from "@octokit/plugin-retry";
const MyOctokit = Octokit.plugin(throttling, retry);
```

## Error handling cheatsheet

```ts
import { RequestError } from "@octokit/request-error";

try {
  await octokit.rest.repos.get({ owner, repo });
} catch (e) {
  if (!(e instanceof RequestError)) throw e;
  switch (e.status) {
    case 301: /* renamed — e.response.headers.location has new URL */ break;
    case 403:
      if (e.message.includes("rate limit")) { /* primary or secondary */ }
      else                                   { /* permissions */ }
      break;
    case 404: /* repo missing or no access */ break;
    case 410: /* issues disabled on this repo */ break;
    case 422: /* validation — bad params */ break;
    case 429: /* secondary rate limit */ break;
  }
}
```

## Data-fetching script skeleton (build-time, idiomatic)

```ts
import { Octokit } from "@octokit/rest";
import { throttling } from "@octokit/plugin-throttling";
import pLimit from "p-limit";

const ThrottledOctokit = Octokit.plugin(throttling);

const octokit = new ThrottledOctokit({
  auth: process.env.GH_TOKEN,
  userAgent: "my-dashboard/1.0",
  throttle: {
    onRateLimit: (after, opts, _, tries) => tries < 2,
    onSecondaryRateLimit: () => true,
  },
});

const repoLimit = pLimit(5);
const issueLimit = pLimit(8);

async function main() {
  const repos = await octokit.paginate(
    octokit.rest.repos.listForOrg,
    { org: "zenbuapps", type: "all", per_page: 100 }
  );

  const active = repos.filter((r) => !r.archived && !r.fork);

  const results = await Promise.all(
    active.map((repo) =>
      repoLimit(async () => {
        const milestones = await octokit.paginate(
          octokit.rest.issues.listMilestones,
          { owner: "zenbuapps", repo: repo.name, state: "all", per_page: 100 }
        );
        if (milestones.length === 0) return { repo, milestones: [] };

        const issues = await issueLimit(() =>
          octokit.paginate(octokit.rest.issues.listForRepo, {
            owner: "zenbuapps",
            repo: repo.name,
            state: "all",
            per_page: 100,
          })
        );

        // filter PRs out — they appear in issues endpoint too
        const realIssues = issues.filter((i) => !i.pull_request);
        return { repo, milestones, issues: realIssues };
      })
    )
  );

  return results;
}
```

## Things to audit when a GitHub script breaks in CI

1. **Did it silently truncate?** — look for `per_page: 30` (default) without `paginate` wrapper. You're getting the first page only.
2. **PRs mixed into issue counts?** — check every `listForRepo` caller for `!i.pull_request` filter.
3. **Archived/fork repos polluting results?** — filter `r.archived` and `r.fork` after `listForOrg`.
4. **Milestone filter type mismatch?** — the `milestone` param must be a **string** (`String(m.number)`), not a number. Silently returns empty array otherwise.
5. **Secondary-limit 429s?** — concurrency too high. Drop `p-limit` caps; add throttling plugin.
6. **Primary-limit 403s?** — token lacks scope, or you're on `GITHUB_TOKEN` in Actions (1000/hr per repo). Switch to a PAT or GitHub App.
7. **404 on a private repo?** — PAT permissions or SSO. Fine-grained PATs need per-org authorization.
8. **`labels` array shape inconsistent?** — labels are usually `{ id, name, color }[]`, but historically GitHub sometimes returns `string[]`. If you need `label.name`, narrow with `typeof label === "string" ? label : label.name`.

See [references/throttling-plugin.md](references/throttling-plugin.md) for advanced throttling options and failure-mode tuning.
