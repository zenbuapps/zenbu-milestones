import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import connectPgSimple from 'connect-pg-simple';
import session from 'express-session';
import passport from 'passport';
import { AppModule } from './app.module';

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
  //   - Cloudflare Tunnel / Railway / 其他反向代理前置時需要，
  //     否則 `req.secure`、`X-Forwarded-Proto` 不會被正確解讀，
  //     導致 express-session 把 secure cookie 視為不安全而拒發。
  //   - 設 `1` 代表信任最近的一層 proxy；足以覆蓋 Cloudflare 情境。
  // --------------------------------------------------------------
  if (isProduction || needsCrossSite) {
    app.set('trust proxy', 1);
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
