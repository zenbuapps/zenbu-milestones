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

  /**
   * [TEMP-DEBUG] 強制寫一個 session，並把 server 端與 cookie 相關的所有事實
   * 印到 X-Debug-* response headers，用於除錯 production secure cookie 寫不進的問題。
   *
   * 為何需要這個 endpoint：
   *   - 過去三次 fix（trust proxy、forceXFP host-match、forceXFP unconditional）
   *     都基於「猜測」推上線，**從未驗證過 production 實際的 req.secure / XFP / SESSION_COOKIE_SECURE**
   *   - 直接打 GET /api/auth/google 觀察不到 Set-Cookie（passport state: false 不寫 session）
   *   - 一般 API endpoint 不會 touch session（saveUninitialized=false）
   *   - 唯一能驗證的方法：強制寫 session、印出 server state、看實際 Set-Cookie attributes
   *
   * 安全性：
   *   - 公開 endpoint，但寫入的 session 只有 debugTouch 時間戳，無敏感資料
   *   - session 自動 prune，不會堆積
   *   - 確認問題後此 method 必須整段移除
   */
  @Get('debug-cookie')
  async debugCookie(@Req() req: Request, @Res() res: Response): Promise<void> {
    // 強制 touch session 以觸發 saveUninitialized=false 下的 Set-Cookie
    const sessionAny = req.session as unknown as Record<string, unknown>;
    sessionAny.debugTouch = Date.now();
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });

    res.setHeader('X-Debug-Node-Env', this.config.get<string>('NODE_ENV') ?? '(unset)');
    res.setHeader('X-Debug-App-Base-Url', this.config.get<string>('APP_BASE_URL') ?? '(unset)');
    res.setHeader(
      'X-Debug-Cookie-Secure-Env',
      this.config.get<string>('SESSION_COOKIE_SECURE') ?? '(unset)',
    );
    res.setHeader('X-Debug-Cors-Origins', this.config.get<string>('CORS_ALLOWED_ORIGINS') ?? '(unset)');
    res.setHeader('X-Debug-Req-Secure', String(req.secure));
    res.setHeader('X-Debug-Req-Protocol', String(req.protocol));
    res.setHeader('X-Debug-Xfp', String(req.headers['x-forwarded-proto'] ?? '(none)'));
    res.setHeader('X-Debug-Xff', String(req.headers['x-forwarded-for'] ?? '(none)'));
    res.setHeader('X-Debug-Forwarded', String(req.headers['forwarded'] ?? '(none)'));
    res.setHeader('X-Debug-Host', String(req.headers.host ?? '(none)'));
    res.setHeader('X-Debug-Session-Id', String(req.sessionID));
    res.setHeader('X-Debug-Build-Sha', process.env.BUILD_SHA ?? '(unset)');

    res.json({ ok: true, sessionId: req.sessionID, touch: sessionAny.debugTouch });
  }

  private getAppBaseUrl(): string {
    return this.config.get<string>('APP_BASE_URL') ?? 'http://localhost:5173';
  }
}
