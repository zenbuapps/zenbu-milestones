import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PinnedRepoDTO } from 'shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * PinnedReposService（issue #16）
 * ---------------------------------------------------------------
 * 個人化釘選清單：每個使用者可釘選自己想關注的 repo，Sidebar 預設只顯示
 * 釘選的 repo。沒有「團隊共享 pin」的概念；如未來要加再走另一張表。
 *
 * 對外動作：
 *   - list(userId)
 *   - pin(userId, owner, name)   — 已釘選回 409 ConflictException
 *   - unpin(userId, owner, name) — 未釘選回 404 NotFoundException
 */
@Injectable()
export class PinnedReposService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<PinnedRepoDTO[]> {
    const rows = await this.prisma.pinnedRepo.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      repoOwner: r.repoOwner,
      repoName: r.repoName,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async pin(userId: string, repoOwner: string, repoName: string): Promise<PinnedRepoDTO> {
    try {
      const row = await this.prisma.pinnedRepo.create({
        data: { userId, repoOwner, repoName },
      });
      return {
        repoOwner: row.repoOwner,
        repoName: row.repoName,
        createdAt: row.createdAt.toISOString(),
      };
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
        throw new ConflictException(`此 repo 已釘選: ${repoOwner}/${repoName}`);
      }
      throw err;
    }
  }

  async unpin(userId: string, repoOwner: string, repoName: string): Promise<void> {
    const res = await this.prisma.pinnedRepo.deleteMany({
      where: { userId, repoOwner, repoName },
    });
    if (res.count === 0) {
      throw new NotFoundException(`未釘選此 repo: ${repoOwner}/${repoName}`);
    }
  }
}
