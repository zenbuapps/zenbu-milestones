import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuditLogRow } from 'shared';
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
