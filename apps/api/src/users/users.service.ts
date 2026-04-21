import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { User } from '@prisma/client';
import type { AdminUserRow, UserRole } from 'shared';
import { AuditService } from '../admin/audit.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 建立 / 更新使用者時的輸入契約。
 * 刻意不直接用 Prisma 的型別，避免上層知道 ORM 細節。
 */
export interface UpsertFromGoogleInput {
  googleSub: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

/**
 * UsersService
 * ---------------------------------------------------------------
 * 封裝 User aggregate 的寫入與查詢。目前僅由 Google OAuth 流程與
 * session deserializer 使用。
 *
 * INITIAL_ADMIN_EMAILS 機制：
 *   - 只在「首次建立」該使用者時生效（走 create 分支）
 *   - 之後即使 email 被移出清單，既有 admin 仍保有 admin（避免誤踢出自己）
 *   - 權限變更需改走管理端 UI（M5 後實作）
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly initialAdminEmails: Set<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {
    // 預先解析 env，避免每次 upsert 都重算；小寫化方便比對
    const raw = this.config.get<string>('INITIAL_ADMIN_EMAILS') ?? '';
    this.initialAdminEmails = new Set(
      raw
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    );
    if (this.initialAdminEmails.size > 0) {
      this.logger.log(`已載入 ${this.initialAdminEmails.size} 筆 INITIAL_ADMIN_EMAILS`);
    }
  }

  /**
   * 由 Google OAuth profile upsert 使用者。
   * - 若 googleSub 已存在 → update 可變欄位（email / displayName / avatarUrl）
   * - 若不存在 → create 並依 INITIAL_ADMIN_EMAILS 決定 role
   */
  async upsertFromGoogle(input: UpsertFromGoogleInput): Promise<User> {
    const emailLower = input.email.toLowerCase();
    const isInitialAdmin = this.initialAdminEmails.has(emailLower);

    return this.prisma.user.upsert({
      where: { googleSub: input.googleSub },
      update: {
        email: emailLower,
        displayName: input.displayName,
        avatarUrl: input.avatarUrl,
      },
      create: {
        googleSub: input.googleSub,
        email: emailLower,
        displayName: input.displayName,
        avatarUrl: input.avatarUrl,
        role: isInitialAdmin ? 'admin' : 'user',
      },
    });
  }

  /**
   * 由 session serializer 在每次請求還原 user 時呼叫。
   * 回 null 代表此 session 綁定的 user 已不存在（被硬刪除），
   * Passport 會把 session 視為未登入。
   */
  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /**
   * 用 email 找 user。主要給 dev-login / 未來的管理員查詢使用。
   * email 一律小寫比對，與 upsertFromGoogle 寫入時的正規化一致。
   */
  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  }

  /**
   * 列出所有使用者（admin 用）。
   * 依 createdAt asc 排序（創建時間較早的先顯示，方便管理員看到老用戶）。
   */
  async listAll(): Promise<AdminUserRow[]> {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return users.map((u) => this.toAdminRow(u));
  }

  /**
   * 變更 user role（admin 專用）。
   *
   * 安全守則（plan §2.1）：
   *   - 禁止自改自己的 role → 403
   *   - 禁止把「最後一位 admin」從 admin 改成 user → 403
   *
   * 若 role 沒改變（例：已經是 admin 又指定 admin）直接回現狀（no-op，不寫 audit）。
   */
  async updateRole(
    actorId: string,
    targetId: string,
    nextRole: UserRole,
  ): Promise<AdminUserRow> {
    if (actorId === targetId) {
      throw new ForbiddenException('不可變更自己的權限');
    }

    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) {
      throw new NotFoundException(`找不到使用者: ${targetId}`);
    }

    const prevRole = target.role as UserRole;
    if (prevRole === nextRole) {
      // no-op：不寫 audit
      return this.toAdminRow(target);
    }

    // 最後一位 admin 防護：只在「admin → user」時檢查
    if (prevRole === 'admin' && nextRole === 'user') {
      const adminCount = await this.prisma.user.count({ where: { role: 'admin' } });
      if (adminCount <= 1) {
        throw new ForbiddenException('不可撤銷最後一位管理員');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: targetId },
      data: { role: nextRole },
    });

    await this.audit.log({
      actorId,
      action: nextRole === 'admin' ? 'role.grant' : 'role.revoke',
      targetType: 'user',
      targetId,
      payload: { targetUserId: targetId, from: prevRole, to: nextRole },
    });

    return this.toAdminRow(updated);
  }

  private toAdminRow(u: User): AdminUserRow {
    return {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      role: u.role as UserRole,
      createdAt: u.createdAt.toISOString(),
    };
  }
}
