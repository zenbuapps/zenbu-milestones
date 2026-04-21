import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  IssueLite,
  Milestone,
  MilestoneIssuesPage,
  RepoDetail,
  RepoSummary,
  Summary,
  Totals,
} from 'shared';
import {
  GitHubService,
  type OctokitIssue,
  type OctokitMilestone,
  type OctokitRepoFromListOrg,
} from '../github/github.service';
import { DashboardCacheService } from './dashboard-cache.service';

/**
 * 敏感 issue 標籤：含任一標籤的 issue 會被排除在 IssueLite 之外。
 * 注意：milestone 的 openIssues / closedIssues 仍保留 GitHub 的原始數字，
 *       不因此過濾而減少（與 fetch-data.ts 一致，保持進度百分比與 GitHub UI 等價）。
 */
const SENSITIVE_LABELS = new Set(['confidential', 'security', 'internal-only']);

/** 預設並發上限；與舊 fetch-data.ts 的 p-limit 設定對齊。 */
const REPO_CONCURRENCY = 5;
const ISSUE_CONCURRENCY = 8;

/** Cache key builders —— 統一於此，方便 refresh-data 以 prefix 清除。 */
export const CacheKeys = {
  summary: (): string => `dashboard:summary`,
  repoDetail: (owner: string, name: string): string =>
    `dashboard:repo:${owner}/${name}`,
  milestoneIssues: (
    owner: string,
    name: string,
    number: number,
    page: number,
    perPage: number,
  ): string =>
    `dashboard:milestone-issues:${owner}/${name}/${number}:p${page}:s${perPage}`,
} as const;

/**
 * 自製 concurrency limiter，避免引入 p-limit（v6 為 ESM-only，在 CJS 環境成本偏高）。
 * 行為等價於 `pLimit(max)(fn)`：同時最多 `max` 個 promise 在 pending。
 */
function createLimiter(max: number): <T>(fn: () => Promise<T>) => Promise<T> {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = (): void => {
    if (active >= max) return;
    const task = queue.shift();
    if (task) task();
  };
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= max) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active += 1;
    try {
      return await fn();
    } finally {
      active -= 1;
      next();
    }
  };
}

/** Milestone completion：空 milestone 回 0（與 fetcher 契約一致，**禁止改為 null**）。 */
function computeCompletion(open: number, closed: number): number {
  const total = open + closed;
  if (total === 0) return 0;
  return closed / total;
}

function isOverdue(
  dueOn: string | null,
  state: 'open' | 'closed',
): boolean {
  if (state === 'closed' || !dueOn) return false;
  return new Date(dueOn).getTime() < Date.now();
}

/**
 * 將 GitHub issue raw payload 投影成 `IssueLite[]`。
 * 排除：
 *   - PR（`pull_request` 欄位存在 → 為 PR 非 issue）
 *   - 帶 SENSITIVE_LABELS 的 issue
 * 並保證：
 *   - labels[].name 為非空字串
 *   - labels[].color 為 6-hex（無 '#' 前綴），無效時 fallback '888888'
 */
function toIssueLite(issues: OctokitIssue[]): IssueLite[] {
  return issues
    .filter((i) => !i.pull_request)
    .filter((i) => {
      const labelNames = (i.labels ?? [])
        .map((l) => (typeof l === 'string' ? l : (l.name ?? '')).toLowerCase())
        .filter(Boolean);
      return !labelNames.some((n) => SENSITIVE_LABELS.has(n));
    })
    .map<IssueLite>((i) => ({
      number: i.number,
      title: i.title,
      state: i.state as 'open' | 'closed',
      labels: (i.labels ?? [])
        .map((l) =>
          typeof l === 'string'
            ? { name: l, color: '888888' }
            : { name: l.name ?? '', color: l.color ?? '888888' },
        )
        .filter((l) => !!l.name),
      assignees: (i.assignees ?? []).map((a) => a.login).filter(Boolean),
      htmlUrl: i.html_url,
      createdAt: i.created_at,
      updatedAt: i.updated_at,
      closedAt: i.closed_at,
    }));
}

/**
 * DashboardService
 * ---------------------------------------------------------------
 * Phase 2 runtime API 的商業邏輯。取代舊 build-time fetcher 的後端等價實作：
 *   - getSummary()                   → GET /api/summary
 *   - getRepoDetail(owner, name)     → GET /api/repos/:owner/:name/detail
 *   - getMilestoneIssues(...)         → GET /api/repos/:owner/:name/milestones/:number/issues
 *
 * 設計：
 *   1. 所有對 GitHub 的呼叫都透過 `GitHubService`；不直接觸 Octokit。
 *   2. 回傳值的 shape 嚴格對齊 `shared/*`（Summary / RepoDetail / MilestoneIssuesPage）。
 *   3. 每個 endpoint 獨立 cache key（TTL 5 分鐘）；refresh-data 走 prefix 清除。
 *   4. 並發控制：listReposForOrg + 每個 repo 的 milestones/issues 抓取各自用獨立 limiter，
 *      避免巢狀 await 互鎖（與 fetch-data.ts 的 repoLimit / issueLimit 設計一致）。
 */
@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);
  private readonly org: string;

  constructor(
    private readonly github: GitHubService,
    private readonly cache: DashboardCacheService,
    private readonly config: ConfigService,
  ) {
    // 保留可設定性：若未設 GITHUB_ORG 則 fallback 'zenbuapps'（專案唯一 org）。
    this.org = this.config.get<string>('GITHUB_ORG') ?? 'zenbuapps';
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /** GET /api/summary —— 取代舊 summary.json。 */
  async getSummary(): Promise<Summary> {
    return this.cache.getOrLoad(CacheKeys.summary(), () => this.buildSummary());
  }

  /** GET /api/repos/:owner/:name/detail —— 取代舊 repos/{name}.json。 */
  async getRepoDetail(owner: string, name: string): Promise<RepoDetail> {
    return this.cache.getOrLoad(CacheKeys.repoDetail(owner, name), () =>
      this.buildRepoDetailFetched(owner, name),
    );
  }

  /** GET /api/repos/:owner/:name/milestones/:number/issues （分頁）。 */
  async getMilestoneIssues(
    owner: string,
    name: string,
    milestoneNumber: number,
    page: number,
    perPage: number,
  ): Promise<MilestoneIssuesPage> {
    return this.cache.getOrLoad(
      CacheKeys.milestoneIssues(owner, name, milestoneNumber, page, perPage),
      async () => {
        const raw = await this.github.listMilestoneIssues(
          owner,
          name,
          milestoneNumber,
        );
        const items = toIssueLite(raw);
        const total = items.length;
        const start = (page - 1) * perPage;
        const slice = items.slice(start, start + perPage);
        return {
          items: slice,
          page,
          perPage,
          total,
          hasMore: start + slice.length < total,
        };
      },
    );
  }

  // ------------------------------------------------------------------
  // Internal build logic（無 cache，由 public API 外層包 cache）
  // ------------------------------------------------------------------

  /**
   * 掃全 org 的 repo，對每個 repo 抓 milestones + issues，組合成 Summary。
   * 排序契約：有 milestone 的 repo 在前，同類內 `name.localeCompare()` 字母序。
   */
  private async buildSummary(): Promise<Summary> {
    const repos = await this.listActiveRepos();

    const repoLimit = createLimiter(REPO_CONCURRENCY);
    const results = await Promise.all(
      repos.map((r) =>
        repoLimit(async () => {
          try {
            return await this.buildRepoBundle(r);
          } catch (e) {
            this.logger.error(
              `build repo bundle failed: ${r.name} — ${(e as Error).message}`,
            );
            throw e;
          }
        }),
      ),
    );

    const allRepoSummaries = results.map((r) => r.summary);
    allRepoSummaries.sort((a, b) => {
      const aActive = a.milestoneCount > 0 ? 0 : 1;
      const bActive = b.milestoneCount > 0 ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return a.name.localeCompare(b.name);
    });

    const activeRepos = allRepoSummaries.filter((r) => r.milestoneCount > 0);
    const totals: Totals = {
      repos: activeRepos.length,
      allRepos: allRepoSummaries.length,
      milestones: allRepoSummaries.reduce((s, r) => s + r.milestoneCount, 0),
      openMilestones: allRepoSummaries.reduce(
        (s, r) => s + r.openMilestoneCount,
        0,
      ),
      closedMilestones: allRepoSummaries.reduce(
        (s, r) => s + r.closedMilestoneCount,
        0,
      ),
      overdueMilestones: allRepoSummaries.reduce(
        (s, r) => s + r.overdueCount,
        0,
      ),
      openIssues: allRepoSummaries.reduce((s, r) => s + r.openIssues, 0),
      closedIssues: allRepoSummaries.reduce((s, r) => s + r.closedIssues, 0),
    };

    return {
      generatedAt: new Date().toISOString(),
      totals,
      repos: allRepoSummaries,
    };
  }

  /**
   * 取得單個 repo 的 RepoDetail。
   * 這是 /api/repos/:owner/:name/detail 背後的真正 fetcher（不含 cache）。
   * 若 owner 不符合本 service 管控的 org，仍走 GitHub（API 允許），但在日誌注記。
   * 若 repo 不存在 / 404，GitHubService 會把錯誤映射成 GitHubError，這裡轉 NotFoundException。
   */
  private async buildRepoDetailFetched(
    owner: string,
    name: string,
  ): Promise<RepoDetail> {
    if (owner !== this.org) {
      this.logger.warn(
        `Fetching repo outside configured org: owner=${owner} (configured=${this.org})`,
      );
    }
    // RepoDetail 本身不依賴 listForOrg 的結果（可少抓一輪），但需要 repo metadata。
    // 這裡選擇「從 org 的 repo 列表找」以重用 cache / 資料一致性；若找不到 → 404。
    const repos = await this.listActiveRepos();
    const meta = repos.find((r) => r.name === name);
    if (!meta) {
      throw new NotFoundException(
        `Repo ${owner}/${name} 不存在或為 archived / fork`,
      );
    }
    const bundle = await this.buildRepoBundle(meta);
    return bundle.detail;
  }

  /**
   * 掃 org 的所有 repo 並過濾：排除 archived / fork。
   * 與舊 fetch-data.ts::listAllRepos 行為等價。
   */
  private async listActiveRepos(): Promise<OctokitRepoFromListOrg[]> {
    const all = await this.github.listReposForOrg(this.org);
    return all.filter((r) => !r.archived && !r.fork);
  }

  /**
   * 為單一 repo 建構 RepoDetail + RepoSummary（兩者共享一次 fetch）。
   * 以 ISSUE_CONCURRENCY 為限抓各 milestone 的 issues 與全 repo issues。
   */
  private async buildRepoBundle(
    repoMeta: OctokitRepoFromListOrg,
  ): Promise<{ detail: RepoDetail; summary: RepoSummary }> {
    const { name } = repoMeta;
    const issueLimit = createLimiter(ISSUE_CONCURRENCY);

    const [milestones, allIssuesRaw] = await Promise.all([
      this.github.listRepoMilestones(this.org, name),
      issueLimit(() => this.github.listAllRepoIssues(this.org, name)),
    ]);

    const milestonesWithIssues: Milestone[] = await Promise.all(
      milestones.map((m: OctokitMilestone) =>
        issueLimit(async () => {
          const raw = await this.github.listMilestoneIssues(
            this.org,
            name,
            m.number,
          );
          const issues = toIssueLite(raw);
          return {
            number: m.number,
            title: m.title,
            description: m.description ?? null,
            state: m.state as 'open' | 'closed',
            dueOn: m.due_on ?? null,
            createdAt: m.created_at,
            updatedAt: m.updated_at,
            closedAt: m.closed_at ?? null,
            openIssues: m.open_issues,
            closedIssues: m.closed_issues,
            completion: computeCompletion(m.open_issues, m.closed_issues),
            htmlUrl: m.html_url,
            issues,
          };
        }),
      ),
    );

    const detail: RepoDetail = {
      name,
      description: repoMeta.description ?? null,
      htmlUrl: repoMeta.html_url,
      isPrivate: repoMeta.private,
      language: repoMeta.language ?? null,
      updatedAt: repoMeta.updated_at ?? new Date().toISOString(),
      milestones: milestonesWithIssues,
      allIssues: toIssueLite(allIssuesRaw),
    };

    const openMs = milestonesWithIssues.filter((m) => m.state === 'open');
    const closedMs = milestonesWithIssues.filter((m) => m.state === 'closed');
    const overdueMs = openMs.filter((m) => isOverdue(m.dueOn, m.state));
    const openIssues = milestonesWithIssues.reduce(
      (s, m) => s + m.openIssues,
      0,
    );
    const closedIssues = milestonesWithIssues.reduce(
      (s, m) => s + m.closedIssues,
      0,
    );
    const nextDue = openMs
      .filter((m): m is Milestone & { dueOn: string } => !!m.dueOn)
      .sort(
        (a, b) => new Date(a.dueOn).getTime() - new Date(b.dueOn).getTime(),
      )[0];

    const summary: RepoSummary = {
      name,
      description: repoMeta.description ?? null,
      htmlUrl: repoMeta.html_url,
      isPrivate: repoMeta.private,
      language: repoMeta.language ?? null,
      updatedAt: repoMeta.updated_at ?? new Date().toISOString(),
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
            dueOn: nextDue.dueOn,
            htmlUrl: nextDue.htmlUrl,
          }
        : null,
    };

    return { detail, summary };
  }
}
