import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import type { Request } from 'express';

/**
 * 把 Passport session 反序列化後寫入 req.user 的 User model
 * 視為需要 role 檢查的最小型別。
 */
interface MaybeAuthedRequest extends Request {
  user?: User;
}

/**
 * AdminGuard
 * ---------------------------------------------------------------
 * 兩層檢查：
 *   1. 未登入 → 401 UnauthorizedException
 *   2. 已登入但 role !== 'admin' → 403 ForbiddenException
 *
 * 為何不直接組合 AuthenticatedGuard + 另一個 RoleGuard：
 *   - Nest @UseGuards 多個 guard 時，前者丟 401 會正常回傳；但合成為單一
 *     guard 可以統一錯誤訊息，也便於日後擴充（例：支援 super-admin）。
 *
 * 注意：session 反序列化器負責「每次請求從 DB 讀最新 user」（見
 * SessionSerializer），因此這裡 req.user.role 已是 up-to-date，不會吃到
 * 被降權的 stale session。
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<MaybeAuthedRequest>();
    const isAuthed = typeof req.isAuthenticated === 'function' && req.isAuthenticated();
    if (!isAuthed || !req.user) {
      throw new UnauthorizedException('請先登入');
    }
    if (req.user.role !== 'admin') {
      throw new ForbiddenException('需要管理員權限');
    }
    return true;
  }
}
