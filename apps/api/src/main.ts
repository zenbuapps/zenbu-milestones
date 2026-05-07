import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import connectPgSimple from 'connect-pg-simple';
import type { NextFunction, Request, Response } from 'express';
import session from 'express-session';
import passport from 'passport';
import { AppModule } from './app.module';
import { GithubExceptionFilter } from './common/filters/github-exception.filter';

/**
 * Bootstrap
 * ---------------------------------------------------------------
 * 啟動順序刻意安排：
 *   1. 建立 Nest app（讀取 env 透過 ConfigModule）
 *   2. 設定 trust proxy（production 或 HTTPS 背後走反向代理時）
 *   3. setGlobalPrefix → /api
 *   4. CORS（必須 credentials: true，否則瀏覽器不會送 session cookie）
 *   5. express-session（cookie 設定依環境動態決定）
 *   6. passport.initialize + passport.session
 *   7. 全域 ValidationPipe
 *   8. listen
 *
 * 為何 ValidationPipe 用 global + DI 寫在此而非 APP_PIPE：
 *   - 目前沒有需要注入到 Pipe 的依賴（如 Translator Service）
 *   - 全域 Pipe 不享 DI 也沒差，寫法最簡潔
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  const nodeEnv = config.get<string>('NODE_ENV') ?? 'development';
  const isProduction = nodeEnv === 'production';

  // --------------------------------------------------------------
  // CORS allowed origins（逗號分隔）
  // --------------------------------------------------------------
  const corsRaw = config.get<string>('CORS_ALLOWED_ORIGINS') ?? '';
  const allowedOrigins = corsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const hasHttpsOrigin = allowedOrigins.some((o) => o.startsWith('https://'));

  // --------------------------------------------------------------
  // Cookie 模式決策：
  //   優先順序：
  //   1. SESSION_COOKIE_SECURE env 明確指定（'true' | 'false'）→ 以此為準
  //   2. 未設時 fallback：production 或 純 HTTPS origins → secure+none；否則 lax+insecure
  //
  //   本地開發雙 HTTP（localhost:5173 ↔ localhost:3000）時必須 SESSION_COOKIE_SECURE=false
  //   否則瀏覽器會拒絕對 http 目標設 secure cookie，OAuth callback 後 session 寫不進去。
  //
  //   Cloudflare Tunnel HTTPS 模式則 SESSION_COOKIE_SECURE=true，配合 trust proxy。
  // --------------------------------------------------------------
  const forceSecureRaw = config.get<string>('SESSION_COOKIE_SECURE');
  const hasExplicitSecure = typeof forceSecureRaw === 'string' && forceSecureRaw.trim() !== '';
  const explicitSecure = hasExplicitSecure && forceSecureRaw.toLowerCase() === 'true';
  const cookieSecure = hasExplicitSecure ? explicitSecure : isProduction || hasHttpsOrigin;
  const cookieSameSite: 'lax' | 'none' = cookieSecure ? 'none' : 'lax';
  const needsCrossSite = cookieSecure;

  // --------------------------------------------------------------
  // Trust proxy
  //   設 true 讓 express 信任 X-Forwarded-* headers（影響 req.ip / req.protocol 等）。
  //   express-session 的 issecure() 在 trust proxy=true 時走 XFP 判斷分支，
  //   配合下方 forceXfpHttps middleware（改寫 XFP=https on host match）才能讓
  //   secure cookie 正確寫入——光靠這條 trust proxy 不夠，因為 K8s Envoy Gateway
  //   實測不送 / 被剝除 XFP，必須由 app 端自己注入。
  // --------------------------------------------------------------
  app.set('trust proxy', true);

  // --------------------------------------------------------------
  // Force X-Forwarded-Proto based on APP_BASE_URL host
  //   問題：cookie.secure=true 時 express-session 內部用 `issecure()` 檢查，
  //         會讀 req.headers['x-forwarded-proto']（trust proxy=true 時走此路徑）
  //         與 req.connection.encrypted。K8s Envoy Gateway 終止 TLS 後 POD 看到
  //         plain HTTP，且 X-Forwarded-Proto 不可靠（可能未送或被剝），
  //         導致 issecure() 回 false → Set-Cookie 被 silently drop。
  //   解法：本專案 same-origin 部署，request 的 host header 必然等於 APP_BASE_URL host，
  //         我們直接從 APP_BASE_URL 推導「可信 HTTPS host」，凡是 host 命中的
  //         request，無條件改寫 x-forwarded-proto = 'https'，讓 issecure() 標準
  //         路徑判定為 HTTPS，secure cookie 才寫得進去。
  //   本地 dev：APP_BASE_URL=http://localhost:5173，protocol=http → trustedHttpsHost=null
  //              → middleware no-op，不影響 HTTP 行為。
  // --------------------------------------------------------------
  const appBaseUrl = config.get<string>('APP_BASE_URL') ?? '';
  const trustedHttpsHost: string | null = (() => {
    try {
      const u = new URL(appBaseUrl);
      return u.protocol === 'https:' ? u.host.toLowerCase() : null;
    } catch {
      return null;
    }
  })();
  if (trustedHttpsHost) {
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const host = (req.headers.host ?? '').toLowerCase();
      if (host === trustedHttpsHost) {
        req.headers['x-forwarded-proto'] = 'https';
      }
      next();
    });
    logger.log(`Force XFP=https middleware enabled for host: ${trustedHttpsHost}`);
  }

  // --------------------------------------------------------------
  // Global prefix：所有 route 自動加 /api 前綴
  // --------------------------------------------------------------
  app.setGlobalPrefix('api');

  // --------------------------------------------------------------
  // CORS：允許 credentials 以便瀏覽器送 session cookie
  // --------------------------------------------------------------
  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    credentials: true,
  });

  // --------------------------------------------------------------
  // Session middleware（必須在 passport.initialize 之前）
  // --------------------------------------------------------------
  const sessionSecret = config.get<string>('SESSION_SECRET');
  if (!sessionSecret) {
    throw new Error('SESSION_SECRET 未設定，請檢查 .env');
  }

  // --------------------------------------------------------------
  // Session store：用 PostgreSQL 持久化
  //   - 避免 api watch reload / 部署時 session 全清（MemoryStore 的雷）
  //   - createTableIfMissing=true 首次啟動會自動建 "session" 表，不需進 Prisma migrate
  //   - DATABASE_URL 由 ConfigModule 從 root .env 載入，Prisma 已驗證可連線
  // --------------------------------------------------------------
  const databaseUrl = config.get<string>('DATABASE_URL');
  if (!databaseUrl) {
    throw new Error('DATABASE_URL 未設定，請檢查 .env');
  }
  const PgSession = connectPgSimple(session);
  const sessionStore = new PgSession({
    conObject: { connectionString: databaseUrl },
    tableName: 'session',
    createTableIfMissing: true,
    pruneSessionInterval: 60 * 15, // 15 分鐘清一次過期 session
  });

  app.use(
    session({
      store: sessionStore,
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: cookieSecure,
        sameSite: cookieSameSite,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 天
      },
    }),
  );

  // --------------------------------------------------------------
  // [TEMP-DEBUG] OAuth callback 路徑攔截：印出 trust-proxy 解析結果與原始 XFP header
  //   排查 prod 登入後 connect.sid cookie 寫不進的問題。
  //   確認修好之後可以連同此 middleware 整段移除（或改為 isDevelopment 才印）。
  // --------------------------------------------------------------
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api/auth/google/callback') || req.path === '/api/auth/google') {
      logger.log(
        `[OAUTH-DEBUG] path=${req.path} secure=${req.secure} protocol=${req.protocol} ` +
          `xfp=${req.headers['x-forwarded-proto'] ?? '(none)'} ` +
          `xff=${req.headers['x-forwarded-for'] ?? '(none)'} ` +
          `host=${req.headers.host}`,
      );
    }
    next();
  });

  // --------------------------------------------------------------
  // Passport：initialize + session deserialize
  // --------------------------------------------------------------
  app.use(passport.initialize());
  app.use(passport.session());

  // --------------------------------------------------------------
  // 全域驗證 pipe：
  //   - whitelist: 未在 DTO 宣告的欄位會被剝除
  //   - transform: 把 plain object 轉成 DTO class 實例（讓裝飾器 metadata 可用）
  // forbidNonWhitelisted 暫不開，避免前端發測試資料時直接 400；若需更嚴可打開。
  // --------------------------------------------------------------
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // --------------------------------------------------------------
  // 全域 ExceptionFilter：把 GitHubError 階層轉成前端可解析的 envelope
  //   { success: false, error: { code, message } }
  // 不影響其他 exception（HttpException、validation、200+success:false ad-hoc）
  // --------------------------------------------------------------
  app.useGlobalFilters(new GithubExceptionFilter());

  const port = Number(config.get<string>('PORT') ?? process.env.PORT ?? 3000);
  await app.listen(port);

  logger.log(`API ready on http://localhost:${port}/api`);
  logger.log(`CORS origins: ${allowedOrigins.join(', ') || '(none)'}`);
  logger.log(
    `Cookie mode: sameSite=${cookieSameSite} secure=${cookieSecure} trustProxy=${
      isProduction || needsCrossSite
    }`,
  );
}

bootstrap().catch((err) => {
  // 啟動期錯誤一律以 fatal 級別記錄並退出
  // eslint-disable-next-line no-console
  console.error('[api] bootstrap failed', err);
  process.exit(1);
});
