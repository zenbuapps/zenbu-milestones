import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

/**
 * AuthenticatedGuard
 * ---------------------------------------------------------------
 * 搭配 Passport session 使用，檢查 `req.isAuthenticated()`：
 *   - 已登入 → 放行
 *   - 未登入 → 拋 401，由全域 ExceptionFilter（或 Nest 預設）回應
 *
 * 刻意不把 401 交由 Passport 的 AuthGuard 處理，因為那適用於 strategy-level
 * 驗證；本專案採用「cookie session」模型，登入後的請求只需檢查 session 狀態。
 */
@Injectable()
export class AuthenticatedGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const isAuthed = typeof req.isAuthenticated === 'function' && req.isAuthenticated();
    if (!isAuthed || !req.user) {
      throw new UnauthorizedException('請先登入');
    }
    return true;
  }
}
