import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Logger,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { UsersService } from '../users/users.service';

/**
 * AuthController
 * ---------------------------------------------------------------
 * 三個端點構成完整 OAuth flow：
 *
 *   GET /api/auth/google          → AuthGuard('google') 觸發跳轉
 *   GET /api/auth/google/callback → Google 回呼，成功後 redirect 回前端
 *   GET /api/auth/logout           → 清除 session + redirect 回前端
 *
 * 所有 redirect 的目標由 APP_BASE_URL env 決定，避免硬編碼於程式碼。
 */
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * 觸發 Google OAuth flow。
   * Guard 本身會 redirect，handler body 不會執行。
   */
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleLogin(): void {
    // noop — AuthGuard('google') 已觸發 redirect 到 Google 同意畫面
  }

  /**
   * Google 回呼。AuthGuard 會：
   *   1. 交換 authorization code → token
   *   2. 呼叫 GoogleStrategy.validate() 取得 user
   *   3. 把 user 寫入 req.user 並建立 session（需 passport.session() middleware）
   *
   * 接著這裡只需 redirect 回前端主頁。
   */
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  googleCallback(@Res() res: Response): void {
    const target = this.getAppBaseUrl();
    res.redirect(target);
  }

  /**
   * 登出：
   *   1. req.logout() 清掉 req.user
   *   2. session.destroy() 清除 store 側的 session
   *   3. 302 redirect 回前端
   */
  @Get('logout')
  logout(@Req() req: Request, @Res() res: Response): void {
    const target = this.getAppBaseUrl();
    req.logout((logoutErr) => {
      if (logoutErr) {
        this.logger.error('req.logout 失敗', logoutErr);
      }
      req.session.destroy((destroyErr) => {
        if (destroyErr) {
          this.logger.error('session.destroy 失敗', destroyErr);
        }
        res.clearCookie('connect.sid');
        res.redirect(target);
      });
    });
  }

  /**
   * [dev-only] 繞過 Google OAuth，直接以指定 email 建立 / 登入 user。
   *
   * 用途：
   *   - 本機 / CI 整合測試 session 與 API 流程（無須每次真的跑完 Google flow）
   *   - 404 on production（NODE_ENV !== 'development' 一律 403 拒絕）
   *
   * 範例：
   *   GET /api/auth/dev-login?email=j7.dev.gg@gmail.com
   */
  @Get('dev-login')
  async devLogin(
    @Query('email') email: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const nodeEnv = this.config.get<string>('NODE_ENV') ?? 'development';
    if (nodeEnv !== 'development') {
      throw new ForbiddenException('dev-login 僅限 development 環境');
    }
    if (!email || !email.includes('@')) {
      throw new BadRequestException('email query 參數必填且需為合法 email');
    }

    try {
      // 先用 email 找現有 user；若 Google flow 已建過就直接重用（避免 email unique 衝突）
      const existing = await this.usersService.findByEmail(email);
      const user =
        existing ??
        (await this.usersService.upsertFromGoogle({
          googleSub: `dev-${email.toLowerCase()}`,
          email,
          displayName: email.split('@')[0],
          avatarUrl: null,
        }));

      // passport 的 req.login 會把 user 塞進 session。包成 promise 以便統一 catch。
      await new Promise<void>((resolve, reject) => {
        req.login(user, (err) => (err ? reject(err) : resolve()));
      });

      res.json({
        success: true,
        data: { userId: user.id, email: user.email, role: user.role },
      });
    } catch (err) {
      const e = err as Error;
      this.logger.error(`dev-login 失敗：${e.message}`, e.stack);
      res.status(500).json({
        success: false,
        error: { code: 'DEV_LOGIN_ERROR', message: e.message, stack: e.stack },
      });
    }
  }

  private getAppBaseUrl(): string {
    return this.config.get<string>('APP_BASE_URL') ?? 'http://localhost:5173';
  }
}
