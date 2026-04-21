import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  IssueStatus as PrismaIssueStatus,
  type Issue,
  type User,
} from '@prisma/client';
import type { AdminIssueRow, IssueStatus, SubmittedIssueDTO } from 'shared';
import { AuditService } from '../admin/audit.service';
import {
  GitHubError,
  RateLimitedError,
  UpstreamAuthError,
} from '../github/github.errors';
import { GitHubService } from '../github/github.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateIssueDto } from './dto/create-issue.dto';

/** 管理員 approve 的結果包含 GitHub 呼叫結果 flag，給 controller 決定回應碼。 */
export interface ApproveResult {
  /** 投影後的最新 row（狀態可能是 approved 或 synced_to_github） */
  row: AdminIssueRow;
  /** 呼叫 GitHub 成功 → status 為 synced_to_github；失敗 → 僅 approved */
  syncedToGitHub: boolean;
  /** GitHub 失敗時帶回 error code 與 message（不含 token） */
  githubError?: { code: GitHubErrorCode; message: string };
}

export type GitHubErrorCode = 'UPSTREAM_ERROR' | 'UPSTREAM_AUTH_ERROR' | 'RATE_LIMITED';

const ADMIN_BODY_PREVIEW_LEN = 200;

/**
 * 狀態轉換 helper
 * ---------------------------------------------------------------
 * Prisma enum 使用底線（synced_to_github），shared 契約用連字號（synced-to-github）。
 * 兩端格式不同是刻意的：
 *   - Prisma 要求 enum 值符合 SQL 識別符規範（不能有連字號）
 *   - shared 的型別會外露到 SPA，採用常見的 kebab-case 字串
 */
const prismaStatusToApi = (s: PrismaIssueStatus): IssueStatus =>
  s === 'synced_to_github' ? 'synced-to-github' : s;

/** shared IssueStatus（可能帶 'all' filter）映射回 Prisma enum；'all' 代表不加 where。 */
const apiStatusToPrisma = (s: IssueStatus): PrismaIssueStatus =>
  s === 'synced-to-github' ? 'synced_to_github' : (s as PrismaIssueStatus);

type IssueWithAuthor = Issue & {
  author: Pick<User, 'id' | 'email' | 'displayName' | 'avatarUrl'>;
};

/**
 * IssuesService
 * ---------------------------------------------------------------
 * 封裝 Issue aggregate 的寫入與查詢。
 *
 * 既有（M1 / M3）：
 *   - createDraft：訪客送出 issue（status = pending）
 *   - listMine：列出當前 user 自己的 issue
 *
 * M4 新增：
 *   - listAll：admin 列表（可依 status filter）
 *   - approveAndSync：通過並代呼 GitHub 建 issue
 *   - reject：拒絕並寫入 rejectReason
 *
 * GitHub 調用原子性策略（plan §8.2）：
 *   先 GitHub → 再 DB。成功：status=synced_to_github；失敗：status=approved
 *   並於 audit log 記下 error code。不把 DB 狀態倒退回 pending，避免審核重複。
 */
@Injectable()
export class IssuesService {
  private readonly logger = new Logger(IssuesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly github: GitHubService,
    private readonly audit: AuditService,
  ) {}

  /**
   * 建立一筆 pending 狀態的 issue。
   *
   * 安全：呼叫端須為已登入 user（AuthenticatedGuard 保護），
   * 這裡再查 repo_settings.canSubmitIssue —— 防止有人繞前端 UI
   * 對管理員關閉投稿的 repo 寫入 issue。
   * 若 repo 尚未在 repo_settings 表（例：新 repo，fetcher 下一輪才會 upsert），
   * 預設允許投稿（canSubmitIssue 欄位預設 true，且 fetcher 會追上）。
   */
  // TODO(M1-extension): rate limit 3/min/user（先走 count(createdAt >= now-60s)）
  async createDraft(authorId: string, dto: CreateIssueDto): Promise<SubmittedIssueDTO> {
    const settings = await this.prisma.repoSettings.findUnique({
      where: {
        repoOwner_repoName: { repoOwner: dto.repoOwner, repoName: dto.repoName },
      },
      select: { canSubmitIssue: true },
    });
    if (settings && !settings.canSubmitIssue) {
      throw new ForbiddenException(
        `此 repo 目前不接受外部投稿（${dto.repoOwner}/${dto.repoName}）`,
      );
    }

    const issue = await this.prisma.issue.create({
      data: {
        authorId,
        repoOwner: dto.repoOwner,
        repoName: dto.repoName,
        title: dto.title,
        bodyMarkdown: dto.body,
        status: 'pending',
      },
    });
    return this.toDto(issue);
  }

  async listMine(authorId: string): Promise<SubmittedIssueDTO[]> {
    const rows = await this.prisma.issue.findMany({
      where: { authorId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => this.toDto(row));
  }

  /**
   * Admin 列表。
   * - status === 'all' 或未提供 → 不加 where
   * - 否則依 status filter
   * 依 createdAt desc 排序。
   */
  async listAll(status?: IssueStatus | 'all'): Promise<AdminIssueRow[]> {
    const where =
      !status || status === 'all' ? {} : { status: apiStatusToPrisma(status) };
    const rows = await this.prisma.issue.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: { id: true, email: true, displayName: true, avatarUrl: true },
        },
      },
    });
    return rows.map((row) => this.toAdminRow(row));
  }

  /**
   * 通過並代轉 GitHub。
   *
   * 失敗分類：
   *   - 404：issue 不存在
   *   - 409：status 已不是 pending（被其他 admin 搶先處理）
   *   - GitHubError：回 syncedToGitHub=false + githubError 讓 controller 回 error envelope
   *                   同時把 DB 狀態推進到 approved（避免重複審核）
   */
  async approveAndSync(id: string, reviewerId: string): Promise<ApproveResult> {
    const existing = await this.prisma.issue.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`找不到 issue: ${id}`);
    }
    if (existing.status !== 'pending') {
      throw new ConflictException(
        `issue 狀態為 ${prismaStatusToApi(existing.status)}，僅 pending 可審核通過`,
      );
    }

    // 先呼 GitHub
    try {
      const gh = await this.github.createIssue({
        owner: existing.repoOwner,
        repo: existing.repoName,
        title: existing.title,
        body: existing.bodyMarkdown,
      });

      // GitHub 成功 → 更新 DB 為 synced_to_github
      const updated = await this.prisma.issue.update({
        where: { id },
        data: {
          status: 'synced_to_github',
          githubIssueNumber: gh.number,
          githubIssueUrl: gh.htmlUrl,
          reviewedById: reviewerId,
          reviewedAt: new Date(),
        },
        include: {
          author: {
            select: { id: true, email: true, displayName: true, avatarUrl: true },
          },
        },
      });

      await this.audit.log({
        actorId: reviewerId,
        action: 'issue.approve',
        targetType: 'issue',
        targetId: id,
        payload: {
          issueId: id,
          githubIssueNumber: gh.number,
          githubIssueUrl: gh.htmlUrl,
        },
      });

      return { row: this.toAdminRow(updated), syncedToGitHub: true };
    } catch (err) {
      if (err instanceof GitHubError) {
        // GitHub 失敗：狀態推進到 approved（避免重覆，等 admin 後續人工處理）
        const updated = await this.prisma.issue.update({
          where: { id },
          data: {
            status: 'approved',
            reviewedById: reviewerId,
            reviewedAt: new Date(),
          },
          include: {
            author: {
              select: { id: true, email: true, displayName: true, avatarUrl: true },
            },
          },
        });

        const code = this.classifyGitHubError(err);
        await this.audit.log({
          actorId: reviewerId,
          action: 'issue.approve',
          targetType: 'issue',
          targetId: id,
          payload: {
            issueId: id,
            error: code,
            message: err.message,
          },
        });

        this.logger.warn(
          `approveAndSync: GitHub 呼叫失敗 issueId=${id} code=${code} status=${err.status ?? 'n/a'}`,
        );

        return {
          row: this.toAdminRow(updated),
          syncedToGitHub: false,
          githubError: { code, message: err.message },
        };
      }
      // 非 GitHub 失敗（DB 等）→ rethrow 讓 global filter 處理
      throw err;
    }
  }

  /** 審核拒絕，寫入 rejectReason + status=rejected。 */
  async reject(id: string, reviewerId: string, reason: string): Promise<AdminIssueRow> {
    const existing = await this.prisma.issue.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`找不到 issue: ${id}`);
    }
    if (existing.status !== 'pending') {
      throw new ConflictException(
        `issue 狀態為 ${prismaStatusToApi(existing.status)}，僅 pending 可拒絕`,
      );
    }

    const updated = await this.prisma.issue.update({
      where: { id },
      data: {
        status: 'rejected',
        rejectReason: reason,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
      },
      include: {
        author: {
          select: { id: true, email: true, displayName: true, avatarUrl: true },
        },
      },
    });

    await this.audit.log({
      actorId: reviewerId,
      action: 'issue.reject',
      targetType: 'issue',
      targetId: id,
      payload: { issueId: id, reason },
    });

    return this.toAdminRow(updated);
  }

  private classifyGitHubError(err: GitHubError): GitHubErrorCode {
    if (err instanceof RateLimitedError) return 'RATE_LIMITED';
    if (err instanceof UpstreamAuthError) return 'UPSTREAM_AUTH_ERROR';
    return 'UPSTREAM_ERROR';
  }

  /**
   * 將 Prisma Issue 投影到 shared SubmittedIssueDTO（使用者自身視角）。
   */
  private toDto(issue: Issue): SubmittedIssueDTO {
    return {
      id: issue.id,
      authorId: issue.authorId,
      repoOwner: issue.repoOwner,
      repoName: issue.repoName,
      title: issue.title,
      bodyMarkdown: issue.bodyMarkdown,
      status: prismaStatusToApi(issue.status),
      githubIssueNumber: issue.githubIssueNumber,
      githubIssueUrl: issue.githubIssueUrl,
      rejectReason: issue.rejectReason,
      createdAt: issue.createdAt.toISOString(),
      updatedAt: issue.updatedAt.toISOString(),
    };
  }

  /** 投影到 admin 列表用 DTO（含 author + bodyPreview）。 */
  private toAdminRow(issue: IssueWithAuthor): AdminIssueRow {
    return {
      id: issue.id,
      title: issue.title,
      bodyPreview: issue.bodyMarkdown.slice(0, ADMIN_BODY_PREVIEW_LEN),
      repoOwner: issue.repoOwner,
      repoName: issue.repoName,
      status: prismaStatusToApi(issue.status),
      author: {
        id: issue.author.id,
        email: issue.author.email,
        displayName: issue.author.displayName,
        avatarUrl: issue.author.avatarUrl,
      },
      githubIssueNumber: issue.githubIssueNumber,
      githubIssueUrl: issue.githubIssueUrl,
      rejectReason: issue.rejectReason,
      createdAt: issue.createdAt.toISOString(),
      updatedAt: issue.updatedAt.toISOString(),
    };
  }
}
