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
import pg from 'pg';
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

/**
 * 轉換 GitHub issue raw payload → IssueLite。
 * 排除 PR 與 SENSITIVE_LABELS。
 */
type GitHubIssue = Awaited<ReturnType<typeof octokit.issues.listForRepo>>['data'][number];

function toIssueLite(issues: GitHubIssue[]): IssueLite[] {
  return issues
    .filter((i) => !i.pull_request)
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

async function listMilestoneIssues(repo: string, milestoneNumber: number): Promise<IssueLite[]> {
  const issues = await octokit.paginate(octokit.issues.listForRepo, {
    owner: ORG,
    repo,
    milestone: String(milestoneNumber),
    state: 'all',
    per_page: 100,
  });
  return toIssueLite(issues);
}

/**
 * 抓 repo 所有 open + closed issues（M6）。
 * 不帶 milestone 參數 → GitHub 回全部 issues（含 milestone 內 / 外）。
 * 排序依 updatedAt desc（GitHub 預設即為此）。
 */
async function listAllRepoIssues(repo: string): Promise<IssueLite[]> {
  const issues = await octokit.paginate(octokit.issues.listForRepo, {
    owner: ORG,
    repo,
    state: 'all',
    per_page: 100,
    sort: 'updated',
    direction: 'desc',
  });
  return toIssueLite(issues);
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

  // 平行抓 milestones meta + repo 全部 issues（M6 新增 allIssues）
  const [milestones, allIssues] = await Promise.all([
    listRepoMilestones(repo),
    issueLimit(() => listAllRepoIssues(repo)),
  ]);

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
    allIssues,
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

  // Clear previous output (保留 .gitkeep 以維持目錄在 repo 中的存在)
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(resolve(OUT_DIR, 'repos'), { recursive: true });
  await writeFile(resolve(OUT_DIR, '.gitkeep'), '', 'utf8');

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

  // Write per-repo files whenever a repo has milestones OR issues
  // （M6 擴張：沒 milestone 但有 issue 的 repo 也要有 detail 檔，才能給 RepoIssueList 使用）
  await Promise.all(
    results
      .filter((r) => r.detail.milestones.length > 0 || r.detail.allIssues.length > 0)
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

  // Upsert repo_settings（plan §4.6-2）
  //   - DATABASE_URL 未設時 graceful skip（本地 dev 或 CI 沒配 DB 不算錯）
  //   - 只 insert 不存在的 repo（不覆蓋管理員已調整的設定）
  //   - 預設 canSubmitIssue = true；visibleOnUI 跟隨 repo 是否公開（private 預設隱藏）
  await upsertRepoSettings(repos);

  const duration = ((Date.now() - start) / 1000).toFixed(1);
  log(`done in ${duration}s.`);
  log(`  total repos: ${totals.allRepos} (active: ${totals.repos})`);
  log(`  milestones: ${totals.milestones} (open: ${totals.openMilestones}, overdue: ${totals.overdueMilestones})`);
  log(`  issues: open=${totals.openIssues}, closed=${totals.closedIssues}`);
  log(`  output: ${OUT_DIR}`);
}

/**
 * 將 fetched repo 清單同步到後端 DB 的 repo_settings 表。
 *
 * 行為（desired state reconciliation，但僅補缺）：
 *   - 不存在 → insert 預設 { canSubmitIssue: true, visibleOnUI: !private }
 *   - 已存在 → **不動**（避免覆蓋管理員在 admin 介面調整過的設定）
 *
 * 使用 INSERT ... ON CONFLICT DO NOTHING 達成 idempotent 行為。
 * 不依賴 Prisma client，避免 fetcher 被 ORM 生成流程綁定；raw SQL 對 schema 變更敏感但
 * repo_settings 欄位穩定（admin migration 驅動）。
 */
async function upsertRepoSettings(
  repos: Awaited<ReturnType<typeof listAllRepos>>,
): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    log('DATABASE_URL 未設定，跳過 repo_settings upsert（這在 CI 未配 DB 時為預期行為）');
    return;
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  try {
    await client.connect();
  } catch (e) {
    log(`  ✗ DB 連線失敗：${(e as Error).message}（跳過 upsert，不影響 JSON 產出）`);
    return;
  }

  try {
    // 一次大批量 INSERT 用參數化 query，ON CONFLICT 走 (repoOwner, repoName) 的 @@unique
    const values: string[] = [];
    const params: (string | boolean)[] = [];
    let idx = 1;
    for (const r of repos) {
      values.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++})`);
      params.push(
        ORG,
        r.name,
        true, // canSubmitIssue 預設允許投稿；admin 可關閉
        !r.private, // visibleOnUI 跟隨是否公開
      );
    }
    if (values.length === 0) {
      log('  無 repo 需要 upsert');
      return;
    }

    // Prisma @@unique([repoOwner, repoName]) 會產生 `repo_settings_repoOwner_repoName_key` 這種名稱
    // 為避免依賴 index 名，改用 ON CONFLICT 指定欄位組合
    // 明確 cast 每個 column：VALUES 子句從參數推導型別時會退回 text，
    // 直接塞進 boolean 欄位會爆 type mismatch。
    const sql = `
      INSERT INTO repo_settings (id, "repoOwner", "repoName", "canSubmitIssue", "visibleOnUI", "updatedAt", "createdAt")
      SELECT
        gen_random_uuid(),
        (t.owner)::text,
        (t.name)::text,
        (t.can_submit)::boolean,
        (t.visible)::boolean,
        now(),
        now()
      FROM (VALUES ${values.join(', ')}) AS t(owner, name, can_submit, visible)
      ON CONFLICT ("repoOwner", "repoName") DO NOTHING
      RETURNING "repoName";
    `;

    const res = await client.query<{ repoName: string }>(sql, params);
    const inserted = res.rowCount ?? 0;
    log(`  ✓ repo_settings upserted: ${inserted} new / ${repos.length - inserted} existing`);
  } catch (e) {
    log(`  ✗ upsert 失敗：${(e as Error).message}（不中斷 fetcher）`);
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((e) => {
  console.error('[fetch-data] FATAL', e);
  process.exit(1);
});
