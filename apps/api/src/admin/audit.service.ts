import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuditLogRow, AuditLogTarget } from 'shared';
import { PrismaService } from '../prisma/prisma.service';

/** 寫入 audit_logs 所需的最小輸入。 */
export interface AuditLogInput {
  actorId: string;
  action: string; // 'role.grant' | 'role.revoke' | 'repo.update' | 'issue.approve' | 'issue.reject'
  targetType: 'user' | 'repo' | 'issue';
  targetId: string;
  payload: Prisma.InputJsonValue;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * AuditService
 * ---------------------------------------------------------------
 * 單一職責：寫入 / 讀取 audit_logs。
 *
 * 設計原則：
 *   - log() 絕不 throw：寫稽核失敗不該阻擋主流程（rethrow 等於讓一次「GitHub 建 issue 成功但 log 失敗」
 *     退回整個操作，使用者會更困惑）。錯誤只記在 console logger。
 *   - 主流程若需要交易式保證，自己用 prisma.$transaction 包 log()。
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditLogInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: input.actorId,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          payload: input.payload,
        },
      });
    } catch (err) {
      const e = err as Error;
      // 不 rethrow：稽核失敗僅記錄，不破壞主流程
      this.logger.error(
        `audit log 寫入失敗 action=${input.action} target=${input.targetType}:${input.targetId}`,
        e.stack,
      );
    }
  }

  /**
   * 列最近 N 筆 audit log（createdAt desc）。
   * limit 預設 50，最大 200（避免單一請求拉太大）。
   *
   * issue #25：同時 join Issue / User 表把 target 資料一併吐回，前端不必再
   * 多打一輪 API 才能顯示「對哪一個 issue 通過 / 拒絕」。
   * - issue.withdraw 會 hard-delete 該筆 issue → 查不到時 fallback 自 payload
   *   讀 title / repoOwner / repoName / githubIssueNumber / githubIssueUrl
   * - repo 類 audit 直接拆 targetId = `${owner}/${name}`
   * - 其他 type 走 'other' 並輸出原 type:id 字串給前端顯示
   */
  async listRecent(rawLimit?: number): Promise<AuditLogRow[]> {
    const take = this.normalizeLimit(rawLimit);
    const rows = await this.prisma.auditLog.findMany({
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        actor: { select: { id: true, email: true, displayName: true } },
      },
    });

    // 收集要批次查的 id
    const issueIds = new Set<string>();
    const userIds = new Set<string>();
    for (const row of rows) {
      if (row.targetType === 'issue') issueIds.add(row.targetId);
      else if (row.targetType === 'user') userIds.add(row.targetId);
    }

    const [issues, users] = await Promise.all([
      issueIds.size > 0
        ? this.prisma.issue.findMany({
            where: { id: { in: [...issueIds] } },
            select: {
              id: true,
              title: true,
              githubIssueNumber: true,
              githubIssueUrl: true,
              repoOwner: true,
              repoName: true,
            },
          })
        : Promise.resolve([]),
      userIds.size > 0
        ? this.prisma.user.findMany({
            where: { id: { in: [...userIds] } },
            select: { id: true, email: true, displayName: true },
          })
        : Promise.resolve([]),
    ]);

    const issueMap = new Map(issues.map((i) => [i.id, i]));
    const userMap = new Map(users.map((u) => [u.id, u]));

    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      actor: {
        id: row.actor.id,
        email: row.actor.email,
        displayName: row.actor.displayName,
      },
      targetType: row.targetType,
      targetId: row.targetId,
      target: buildTarget(row.targetType, row.targetId, row.payload, issueMap, userMap),
      payload: row.payload,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  private normalizeLimit(raw: number | undefined): number {
    if (raw == null || !Number.isFinite(raw)) return DEFAULT_LIMIT;
    if (raw <= 0) return DEFAULT_LIMIT;
    return Math.min(Math.floor(raw), MAX_LIMIT);
  }
}

/** Prisma JSON 欄位的安全 cast，只取 plain object */
type PlainPayload = Record<string, unknown>;
const asPlainPayload = (raw: unknown): PlainPayload => {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as PlainPayload;
  }
  return {};
};

type IssueProjection = {
  id: string;
  title: string;
  githubIssueNumber: number | null;
  githubIssueUrl: string | null;
  repoOwner: string;
  repoName: string;
};

type UserProjection = {
  id: string;
  email: string;
  displayName: string;
};

/**
 * 依 (targetType, targetId, payload) 推導 AuditLogTarget。
 * 抽到 module-level 一來語意聚焦，二來避免 listRecent 內巢狀 closure 過深。
 */
function buildTarget(
  targetType: string,
  targetId: string,
  rawPayload: unknown,
  issueMap: Map<string, IssueProjection>,
  userMap: Map<string, UserProjection>,
): AuditLogTarget {
  if (targetType === 'issue') {
    const fresh = issueMap.get(targetId);
    if (fresh) {
      return {
        kind: 'issue',
        title: fresh.title,
        githubIssueNumber: fresh.githubIssueNumber,
        githubIssueUrl: fresh.githubIssueUrl,
        repoOwner: fresh.repoOwner,
        repoName: fresh.repoName,
      };
    }
    // Issue 已 hard-delete（withdraw 流程）：fallback 自 payload
    const p = asPlainPayload(rawPayload);
    return {
      kind: 'issue',
      title: typeof p.title === 'string' ? p.title : null,
      githubIssueNumber:
        typeof p.githubIssueNumber === 'number' ? p.githubIssueNumber : null,
      githubIssueUrl:
        typeof p.githubIssueUrl === 'string' ? p.githubIssueUrl : null,
      repoOwner: typeof p.repoOwner === 'string' ? p.repoOwner : null,
      repoName: typeof p.repoName === 'string' ? p.repoName : null,
    };
  }
  if (targetType === 'user') {
    const fresh = userMap.get(targetId);
    return {
      kind: 'user',
      email: fresh?.email ?? null,
      displayName: fresh?.displayName ?? null,
    };
  }
  if (targetType === 'repo') {
    // targetId 由 repo-settings.service.ts 寫為 `${owner}/${name}`
    const slashIdx = targetId.indexOf('/');
    const owner = slashIdx > 0 ? targetId.slice(0, slashIdx) : '';
    const name = slashIdx > 0 ? targetId.slice(slashIdx + 1) : targetId;
    return { kind: 'repo', repoOwner: owner, repoName: name };
  }
  return { kind: 'other', label: `${targetType}:${targetId}` };
}
