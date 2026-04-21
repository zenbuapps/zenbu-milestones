import { Injectable } from '@nestjs/common';
import type { RepoSettings } from '@prisma/client';
import type { PublicRepoSettingsRow, RepoSettingsRow } from 'shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';
import type { UpdateRepoSettingsDto } from './dto/update-repo-settings.dto';

type RepoSettingsWithUpdater = RepoSettings & {
  updatedBy: { id: string; email: string; displayName: string } | null;
};

/**
 * RepoSettingsService
 * ---------------------------------------------------------------
 * 管理 repo_settings 表：
 *   - listAll：所有 repo 設定，依 owner/name 字母序
 *   - updateOne：upsert 單筆並寫 audit log（記錄變更前後）
 *
 * Upsert 策略（plan §8.4）：
 *   - 紀錄不存在 → create 時套用「預設值 true/true」再合併 dto
 *     （因為 admin 可能想搶在 fetcher 之前手動設定）
 *   - 紀錄存在 → 只 update dto 提供的欄位
 *
 * 注意：為了 audit 能記錄「before / after」，update 分支先讀一次再寫，
 * 不用 upsert 單步，避免拿不到 before 狀態。重複的 round-trip 在 admin 操作
 * 頻率下可忽略。
 */
@Injectable()
export class RepoSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listAll(): Promise<RepoSettingsRow[]> {
    const rows = await this.prisma.repoSettings.findMany({
      orderBy: [{ repoOwner: 'asc' }, { repoName: 'asc' }],
      include: {
        updatedBy: { select: { id: true, email: true, displayName: true } },
      },
    });
    return rows.map((row) => this.toRow(row));
  }

  /**
   * 公開版列表（匿名訪客可讀），僅回「要不要顯示 / 能否投稿」兩個 boolean。
   * Sidebar / OverviewPage 等前端入口用這支 API 即時反映 admin toggle 結果。
   * 不含 updatedBy 等管理員身份資訊，避免隨便洩漏 admin email。
   */
  async listPublic(): Promise<PublicRepoSettingsRow[]> {
    const rows = await this.prisma.repoSettings.findMany({
      orderBy: [{ repoOwner: 'asc' }, { repoName: 'asc' }],
      select: {
        repoOwner: true,
        repoName: true,
        canSubmitIssue: true,
        visibleOnUI: true,
      },
    });
    return rows;
  }

  /**
   * 變更單一 repo 的設定。
   * actorId 會寫進 updatedById 與 audit log。
   */
  async updateOne(
    actorId: string,
    repoOwner: string,
    repoName: string,
    dto: UpdateRepoSettingsDto,
  ): Promise<RepoSettingsRow> {
    const existing = await this.prisma.repoSettings.findUnique({
      where: { repoOwner_repoName: { repoOwner, repoName } },
    });

    // 若 dto 沒給任何欄位就直接 no-op 回現值（或首次建立的預設）
    const hasChanges =
      dto.canSubmitIssue !== undefined || dto.visibleOnUI !== undefined;

    let after: RepoSettingsWithUpdater;
    const before = existing
      ? {
          canSubmitIssue: existing.canSubmitIssue,
          visibleOnUI: existing.visibleOnUI,
        }
      : { canSubmitIssue: true, visibleOnUI: true };

    if (!existing) {
      // 首次：以預設 true/true 為基底套用 dto
      const created = await this.prisma.repoSettings.create({
        data: {
          repoOwner,
          repoName,
          canSubmitIssue: dto.canSubmitIssue ?? true,
          visibleOnUI: dto.visibleOnUI ?? true,
          updatedById: actorId,
        },
        include: {
          updatedBy: { select: { id: true, email: true, displayName: true } },
        },
      });
      after = created;
    } else if (hasChanges) {
      const updated = await this.prisma.repoSettings.update({
        where: { id: existing.id },
        data: {
          ...(dto.canSubmitIssue !== undefined
            ? { canSubmitIssue: dto.canSubmitIssue }
            : {}),
          ...(dto.visibleOnUI !== undefined
            ? { visibleOnUI: dto.visibleOnUI }
            : {}),
          updatedById: actorId,
        },
        include: {
          updatedBy: { select: { id: true, email: true, displayName: true } },
        },
      });
      after = updated;
    } else {
      // no-op：當成查詢請求
      const found = await this.prisma.repoSettings.findUnique({
        where: { id: existing.id },
        include: {
          updatedBy: { select: { id: true, email: true, displayName: true } },
        },
      });
      // 理論上 found 必不為 null（剛才才讀到），保險做 fallback
      after = found ?? ({ ...existing, updatedBy: null } as RepoSettingsWithUpdater);
    }

    await this.audit.log({
      actorId,
      action: 'repo.update',
      targetType: 'repo',
      targetId: `${repoOwner}/${repoName}`,
      payload: {
        repoOwner,
        repoName,
        before,
        after: {
          canSubmitIssue: after.canSubmitIssue,
          visibleOnUI: after.visibleOnUI,
        },
      },
    });

    return this.toRow(after);
  }

  private toRow(row: RepoSettingsWithUpdater): RepoSettingsRow {
    return {
      id: row.id,
      repoOwner: row.repoOwner,
      repoName: row.repoName,
      canSubmitIssue: row.canSubmitIssue,
      visibleOnUI: row.visibleOnUI,
      updatedBy: row.updatedBy
        ? {
            id: row.updatedBy.id,
            email: row.updatedBy.email,
            displayName: row.updatedBy.displayName,
          }
        : null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
