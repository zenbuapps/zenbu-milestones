# @octokit/plugin-throttling reference

Extended detail on throttling. The main SKILL body covers the 90% case — read this file when you need to tune callback behaviour, combine plugins, or debug a stuck queue.

## Why this plugin exists

The Octokit core request function has no built-in awareness of GitHub's rate-limit headers. Left alone, a burst of 300 requests will fire all at once, trip the secondary concurrent-request limit, and get 429'd. The throttling plugin wraps every outgoing request in a queue that:

1. Reads `x-ratelimit-remaining` and `x-ratelimit-reset` from every response.
2. When a 403/429 comes back with `retry-after`, pauses the queue for that many seconds.
3. Re-issues the request after the pause.
4. Calls your `onRateLimit` / `onSecondaryRateLimit` callback for each violation, letting you veto retries.

It does **not** prevent you from hitting the limit in the first place — `p-limit` or similar bounded-concurrency is still your job. The plugin is about graceful recovery.

## Full option shape

```ts
import { Octokit } from "@octokit/core";
import { throttling } from "@octokit/plugin-throttling";

const ThrottledOctokit = Octokit.plugin(throttling);

const octokit = new ThrottledOctokit({
  auth: process.env.GH_TOKEN,
  throttle: {
    enabled: true,                       // default; set false to bypass (testing)
    retryAfterBaseValue: 1000,           // ms — multiplier for retry-after header
    fallbackSecondaryRateRetryAfter: 60, // seconds — default wait when retry-after absent

    onRateLimit: (retryAfter, options, octokit, retryCount) => {
      octokit.log.warn(
        `Primary rate-limit: ${options.method} ${options.url} (retry in ${retryAfter}s)`
      );
      if (retryCount < 3) return true;   // retry up to 3 times
      // return false/undefined ⇒ throw to caller
    },

    onSecondaryRateLimit: (retryAfter, options, octokit) => {
      octokit.log.warn(
        `Secondary rate-limit: ${options.method} ${options.url}`
      );
      return true;                       // always retry (respects retry-after)
    },
  },
});
```

### Callback semantics

Return values from the two callbacks:
- `true` — retry after waiting `retryAfter` seconds
- `false` / `undefined` — throw a `RequestError` back to the caller

`retryCount` is **only passed to `onRateLimit`**, not to `onSecondaryRateLimit`. Secondary-limit retries are always retried if you return `true`; the plugin protects against loops by honouring `retry-after` (which grows with repeated violations on GitHub's side).

## Combining with `@octokit/plugin-retry`

Retry handles transient 5xx and network errors. Throttling handles 403/429. They're orthogonal and can be combined:

```ts
import { retry } from "@octokit/plugin-retry";
import { throttling } from "@octokit/plugin-throttling";

const MyOctokit = Octokit.plugin(throttling, retry);
```

Plugin order matters for some interactions but for these two, either order works. Retry respects `retry-after` too.

## When NOT to use this plugin

- **You want fast-fail behaviour** (e.g. in a test) — the plugin will silently wait and retry, which looks like a hang.
- **You're already retrying at a higher layer** (e.g. a job queue that retries whole runs) — double retries multiply wait time unhelpfully.
- **You're doing a one-shot query** that either succeeds or bails — the overhead isn't worth it.

For a build-time fetcher that must complete reliably even under load, the plugin is strongly recommended.

## Common tuning mistakes

### Returning `true` forever
```ts
// BAD — infinite retries on persistent 403
onRateLimit: () => true
```
If your token genuinely lacks scope, every request returns 403; `true` retries forever. Always gate by `retryCount`:
```ts
onRateLimit: (after, opts, _, tries) => tries < 2
```

### Logging nothing
Silent failures are maddening in CI. Always log the retry attempts — the time between "my job is slow" and "my token is being throttled" is measurable in human hours saved.

### Not combining with bounded concurrency
`throttling` alone will let you queue 10,000 requests. They'll all fire at once on the first available tick — straight into a secondary limit. Use `p-limit(5..10)` on the outside.

## Debugging a stuck queue

If requests seem to hang indefinitely:

1. **Check your callbacks return a value** — accidentally returning `undefined` on a reachable branch means the plugin thinks you declined the retry but the request still sits in the queue.
2. **Check `retryAfter` values in your log** — if you see `retryAfter: 3600`, you hit a primary limit and are waiting an hour. Kill the job and use a higher-ceiling token.
3. **Check the abort signal is wired** — if you passed `request.signal`, an external abort will cancel queued requests cleanly; without it, they sit until the process exits.

## Disabling the plugin in tests

```ts
const octokit = new ThrottledOctokit({
  auth: "test",
  throttle: { enabled: false },
});
```

Requests go out immediately with no queuing — useful for nock-based tests where deterministic ordering matters.
