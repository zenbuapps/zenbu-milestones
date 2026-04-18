/**
 * Build-time data fetcher for the Zenbu Milestones dashboard.
 *
 * Fetches all repos, milestones, and issues under the `zenbuapps` GitHub org
 * using a Fine-grained PAT (env: GH_TOKEN) and writes static JSON bundles to
 * `public/data/` for the SPA to consume.
 *
 * Usage:
 *   GH_TOKEN=ghp_xxx pnpm run fetch-data
 *
 * Rate limit notes:
 *   - Authenticated primary rate limit: 5000 req/hour
 *   - Secondary (concurrency) limit: we cap at 5 parallel requests via p-limit
 *   - Expected call count: ~1 (repos list) + 33 (milestones per repo) + N_milestones (issues) = ~50-100 calls
 */

import { Octokit } from '@octokit/rest';
import pLimit from 'p-limit';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  IssueLite,
  Milestone,
  RepoDetail,
  RepoSummary,
  Summary,
  Totals,
} from '../src/data/types.ts';

const ORG = 'zenbuapps';
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'public', 'data');

/** Labels that, if present on an issue, mark it as sensitive and exclude it from output.
 *  Extend this list as needed — note this only excludes the issue body/title from the bundle,
 *  milestone counts will still reflect GitHub's numbers. */
const SENSITIVE_LABELS = new Set(['confidential', 'security', 'internal-only']);

const token = process.env.GH_TOKEN;
if (!token) {
  console.error('ERROR: GH_TOKEN env var is required.');
  process.exit(1);
}

const octokit = new Octokit({ auth: token });
// Two independent limiters to avoid nested-await deadlock:
//   repoLimit: caps parallel repo-level tasks
//   issueLimit: caps parallel issue fetches inside any repo task
const repoLimit = pLimit(5);
const issueLimit = pLimit(8);

function log(msg: string): void {
  process.stdout.write(`[fetch-data] ${msg}\n`);
}

async function listAllRepos(): Promise<
  Array<{
    name: string;
    description: string | null;
    html_url: string;
    private: boolean;
    language: string | null;
    updated_at: string;
    archived: boolean;
    fork: boolean;
  }>
> {
  log(`fetching repo list for org=${ORG} ...`);
  const repos = await octokit.paginate(octokit.repos.listForOrg, {
    org: ORG,
    type: 'all',
    per_page: 100,
  });
  const result = repos
    .filter((r) => !r.archived && !r.fork)
    .map((r) => ({
      name: r.name,
      description: r.description,
      html_url: r.html_url,
      private: r.private,
      language: r.language ?? null,
      updated_at: r.updated_at ?? new Date().toISOString(),
      archived: r.archived ?? false,
      fork: r.fork ?? false,
    }));
  log(`got ${result.length} active (non-archived, non-fork) repos`);
  return result;
}

async function listRepoMilestones(repo: string): Promise<
  Array<{
    number: number;
    title: string;
    description: string | null;
    state: 'open' | 'closed';
    due_on: string | null;
    created_at: string;
    updated_at: string;
    closed_at: string | null;
    open_issues: number;
    closed_issues: number;
    html_url: string;
  }>
> {
  const milestones = await octokit.paginate(octokit.issues.listMilestones, {
    owner: ORG,
    repo,
    state: 'all',
    per_page: 100,
  });
  return milestones.map((m) => ({
    number: m.number,
    title: m.title,
    description: m.description ?? null,
    state: m.state as 'open' | 'closed',
    due_on: m.due_on,
    created_at: m.created_at,
    updated_at: m.updated_at,
    closed_at: m.closed_at,
    open_issues: m.open_issues,
    closed_issues: m.closed_issues,
    html_url: m.html_url,
  }));
}

async function listMilestoneIssues(repo: string, milestoneNumber: number): Promise<IssueLite[]> {
  const issues = await octokit.paginate(octokit.issues.listForRepo, {
    owner: ORG,
    repo,
    milestone: String(milestoneNumber),
    state: 'all',
    per_page: 100,
  });

  return issues
    .filter((i) => !i.pull_request) // exclude PRs (GitHub returns PRs via issues endpoint)
    .filter((i) => {
      const labels = (i.labels ?? [])
        .map((l) => (typeof l === 'string' ? l : (l.name ?? '')).toLowerCase())
        .filter(Boolean);
      return !labels.some((n) => SENSITIVE_LABELS.has(n));
    })
    .map<IssueLite>((i) => ({
      number: i.number,
      title: i.title,
      state: i.state as 'open' | 'closed',
      labels: (i.labels ?? [])
        .map((l) => (typeof l === 'string' ? { name: l, color: '888888' } : { name: l.name ?? '', color: l.color ?? '888888' }))
        .filter((l) => !!l.name),
      assignees: (i.assignees ?? []).map((a) => a.login).filter(Boolean),
      htmlUrl: i.html_url,
      createdAt: i.created_at,
      updatedAt: i.updated_at,
      closedAt: i.closed_at,
    }));
}

function computeCompletion(open: number, closed: number): number {
  const total = open + closed;
  if (total === 0) return 0;
  return closed / total;
}

function isOverdue(dueOn: string | null, state: 'open' | 'closed'): boolean {
  if (state === 'closed' || !dueOn) return false;
  return new Date(dueOn).getTime() < Date.now();
}

async function buildRepoDetail(repoMeta: Awaited<ReturnType<typeof listAllRepos>>[number]): Promise<{
  detail: RepoDetail;
  summary: RepoSummary;
}> {
  const repo = repoMeta.name;
  const milestones = await listRepoMilestones(repo);

  // Fetch issues for each milestone with limited concurrency
  const milestonesWithIssues: Milestone[] = await Promise.all(
    milestones.map((m) =>
      issueLimit(async () => {
        const issues = await listMilestoneIssues(repo, m.number);
        return {
          number: m.number,
          title: m.title,
          description: m.description,
          state: m.state,
          dueOn: m.due_on,
          createdAt: m.created_at,
          updatedAt: m.updated_at,
          closedAt: m.closed_at,
          openIssues: m.open_issues,
          closedIssues: m.closed_issues,
          completion: computeCompletion(m.open_issues, m.closed_issues),
          htmlUrl: m.html_url,
          issues,
        } satisfies Milestone;
      }),
    ),
  );

  const detail: RepoDetail = {
    name: repo,
    description: repoMeta.description,
    htmlUrl: repoMeta.html_url,
    isPrivate: repoMeta.private,
    language: repoMeta.language,
    updatedAt: repoMeta.updated_at,
    milestones: milestonesWithIssues,
  };

  // Compute repo-level summary
  const openMs = milestonesWithIssues.filter((m) => m.state === 'open');
  const closedMs = milestonesWithIssues.filter((m) => m.state === 'closed');
  const overdueMs = openMs.filter((m) => isOverdue(m.dueOn, m.state));
  const openIssues = milestonesWithIssues.reduce((s, m) => s + m.openIssues, 0);
  const closedIssues = milestonesWithIssues.reduce((s, m) => s + m.closedIssues, 0);
  const nextDue = openMs
    .filter((m) => m.dueOn)
    .sort((a, b) => new Date(a.dueOn!).getTime() - new Date(b.dueOn!).getTime())[0];

  const summary: RepoSummary = {
    name: repo,
    description: repoMeta.description,
    htmlUrl: repoMeta.html_url,
    isPrivate: repoMeta.private,
    language: repoMeta.language,
    updatedAt: repoMeta.updated_at,
    milestoneCount: milestonesWithIssues.length,
    openMilestoneCount: openMs.length,
    closedMilestoneCount: closedMs.length,
    overdueCount: overdueMs.length,
    completionRate: computeCompletion(openIssues, closedIssues),
    openIssues,
    closedIssues,
    nextDueMilestone: nextDue
      ? {
          number: nextDue.number,
          title: nextDue.title,
          dueOn: nextDue.dueOn!,
          htmlUrl: nextDue.htmlUrl,
        }
      : null,
  };

  return { detail, summary };
}

async function main(): Promise<void> {
  const start = Date.now();

  // Clear previous output
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(resolve(OUT_DIR, 'repos'), { recursive: true });

  const repos = await listAllRepos();

  log(`building repo details (parallelism=5) ...`);
  const results = await Promise.all(
    repos.map((r) =>
      repoLimit(async () => {
        try {
          const out = await buildRepoDetail(r);
          log(`  ✓ ${r.name} (${out.detail.milestones.length} milestones)`);
          return out;
        } catch (e) {
          log(`  ✗ ${r.name} FAILED: ${(e as Error).message}`);
          throw e;
        }
      }),
    ),
  );

  // Write per-repo files only when a repo has at least one milestone
  await Promise.all(
    results
      .filter((r) => r.detail.milestones.length > 0)
      .map((r) =>
        writeFile(
          resolve(OUT_DIR, 'repos', `${r.detail.name}.json`),
          JSON.stringify(r.detail, null, 2),
          'utf8',
        ),
      ),
  );

  // Aggregate summary
  const allRepoSummaries = results.map((r) => r.summary);
  const activeRepos = allRepoSummaries.filter((r) => r.milestoneCount > 0);

  // Sort: repos with milestones first (alphabetical), then empty repos (alphabetical)
  allRepoSummaries.sort((a, b) => {
    const aActive = a.milestoneCount > 0 ? 0 : 1;
    const bActive = b.milestoneCount > 0 ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return a.name.localeCompare(b.name);
  });

  const totals: Totals = {
    repos: activeRepos.length,
    allRepos: allRepoSummaries.length,
    milestones: allRepoSummaries.reduce((s, r) => s + r.milestoneCount, 0),
    openMilestones: allRepoSummaries.reduce((s, r) => s + r.openMilestoneCount, 0),
    closedMilestones: allRepoSummaries.reduce((s, r) => s + r.closedMilestoneCount, 0),
    overdueMilestones: allRepoSummaries.reduce((s, r) => s + r.overdueCount, 0),
    openIssues: allRepoSummaries.reduce((s, r) => s + r.openIssues, 0),
    closedIssues: allRepoSummaries.reduce((s, r) => s + r.closedIssues, 0),
  };

  const summary: Summary = {
    generatedAt: new Date().toISOString(),
    totals,
    repos: allRepoSummaries,
  };

  await writeFile(resolve(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');

  // Also write a flat repos.json for convenience (same as summary.repos but standalone)
  await writeFile(resolve(OUT_DIR, 'repos.json'), JSON.stringify(allRepoSummaries, null, 2), 'utf8');

  const duration = ((Date.now() - start) / 1000).toFixed(1);
  log(`done in ${duration}s.`);
  log(`  total repos: ${totals.allRepos} (active: ${totals.repos})`);
  log(`  milestones: ${totals.milestones} (open: ${totals.openMilestones}, overdue: ${totals.overdueMilestones})`);
  log(`  issues: open=${totals.openIssues}, closed=${totals.closedIssues}`);
  log(`  output: ${OUT_DIR}`);
}

main().catch((e) => {
  console.error('[fetch-data] FATAL', e);
  process.exit(1);
});
