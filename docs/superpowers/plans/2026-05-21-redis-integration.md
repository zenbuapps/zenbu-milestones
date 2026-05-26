# Redis Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace in-memory dashboard cache and PostgreSQL session store with Redis to eliminate cold-start latency and enable multi-replica scaling.

**Architecture:** A single Redis 7 instance (StatefulSet in K8s, Docker container locally) serves two purposes: dashboard data cache (5min TTL, `dashboard:` prefix) and session store (7d TTL, `sess:` prefix). NestJS connects via `ioredis`, sessions via `connect-redis`.

**Tech Stack:** ioredis, connect-redis, Redis 7 Alpine, Helm StatefulSet, NestJS Global Module

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `apps/api/package.json` | Add ioredis + connect-redis, remove connect-pg-simple |
| Create | `apps/api/src/redis/redis.service.ts` | ioredis wrapper with get/set/del/deleteByPrefix |
| Create | `apps/api/src/redis/redis.module.ts` | Global NestJS module exporting RedisService |
| Modify | `apps/api/src/app.module.ts` | Import RedisModule |
| Modify | `apps/api/src/dashboard/dashboard-cache.service.ts` | Replace Map with RedisService |
| Modify | `apps/api/src/main.ts` | Replace connect-pg-simple with connect-redis |
| Modify | `helm/zenbu-roadmaps/values.yaml` | Add redis config section |
| Create | `helm/zenbu-roadmaps/templates/redis.yaml` | Redis StatefulSet + Service + PVC |
| Modify | `helm/zenbu-roadmaps/templates/secret.yaml` | Add REDIS_URL to secrets |
| Modify | `.env.example` | Add REDIS_URL example |

---

### Task 1: Install dependencies

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Add ioredis and connect-redis**

```bash
cd /Users/powerhouse/Documents/works/ai-projects/Zenbu/zenbu-roadmaps
pnpm --filter api add ioredis connect-redis
```

- [ ] **Step 2: Remove connect-pg-simple**

```bash
pnpm --filter api remove connect-pg-simple @types/connect-pg-simple
```

Note: Keep `pg` — it's used by Prisma.

- [ ] **Step 3: Verify package.json**

Run:
```bash
cd /Users/powerhouse/Documents/works/ai-projects/Zenbu/zenbu-roadmaps
grep -E 'ioredis|connect-redis|connect-pg-simple' apps/api/package.json
```

Expected: `ioredis` and `connect-redis` present in dependencies; `connect-pg-simple` absent.

- [ ] **Step 4: Verify build still passes**

```bash
pnpm --filter api build
```

Expected: build succeeds (unused imports will be fixed in later tasks).

- [ ] **Step 5: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): add ioredis + connect-redis, remove connect-pg-simple"
```

---

### Task 2: Create RedisService

**Files:**
- Create: `apps/api/src/redis/redis.service.ts`

- [ ] **Step 1: Create the redis directory**

```bash
mkdir -p /Users/powerhouse/Documents/works/ai-projects/Zenbu/zenbu-roadmaps/apps/api/src/redis
```

- [ ] **Step 2: Create redis.service.ts**

Create `apps/api/src/redis/redis.service.ts` with the following content:

```typescript
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(configService: ConfigService) {
    const redisUrl = configService.get<string>('REDIS_URL');
    if (!redisUrl) {
      throw new Error('REDIS_URL 未設定，請檢查 .env');
    }
    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
    this.client.on('connect', () => this.logger.log('Redis connected'));
    this.client.on('error', (err) => this.logger.error('Redis error', err.message));
  }

  /** 取得快取值；未命中回傳 null。 */
  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      await this.client.del(key);
      return null;
    }
  }

  /** 寫入快取，附選填 TTL（毫秒）。 */
  async set(key: string, value: unknown, ttlMs?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlMs && ttlMs > 0) {
      await this.client.set(key, serialized, 'PX', ttlMs);
    } else {
      await this.client.set(key, serialized);
    }
  }

  /** 刪除單一 key。 */
  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  /**
   * 刪除所有以 prefix 開頭的 key（用 SCAN，不用 KEYS）。
   * 回傳實際刪除筆數。
   */
  async deleteByPrefix(prefix: string): Promise<number> {
    let count = 0;
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.client.scan(
        cursor,
        'MATCH',
        `${prefix}*`,
        'COUNT',
        100,
      );
      cursor = nextCursor;
      if (keys.length > 0) {
        await this.client.del(...keys);
        count += keys.length;
      }
    } while (cursor !== '0');

    if (count > 0) {
      this.logger.log(`Cleared ${count} key(s) with prefix "${prefix}"`);
    }
    return count;
  }

  /** 取得原生 ioredis client（供 connect-redis 使用）。 */
  getClient(): Redis {
    return this.client;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
    this.logger.log('Redis disconnected');
  }
}
```

- [ ] **Step 3: Verify file compiles**

```bash
cd /Users/powerhouse/Documents/works/ai-projects/Zenbu/zenbu-roadmaps
pnpm --filter api exec tsc --noEmit --pretty 2>&1 | head -20
```

Expected: no errors related to `redis.service.ts` (there may be errors from main.ts due to removed connect-pg-simple — that's expected and fixed in Task 5).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/redis/redis.service.ts
git commit -m "feat(api): add RedisService with ioredis wrapper"
```

---

### Task 3: Create RedisModule and register in AppModule

**Files:**
- Create: `apps/api/src/redis/redis.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Create redis.module.ts**

Create `apps/api/src/redis/redis.module.ts` with the following content:

```typescript
import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
```

- [ ] **Step 2: Add RedisModule to AppModule imports**

In `apps/api/src/app.module.ts`, add the import statement and add `RedisModule` to the imports array.

Add at line 9 (after the existing imports):
```typescript
import { RedisModule } from './redis/redis.module';
```

Add `RedisModule` to the imports array, after `PrismaModule`:
```typescript
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['../../.env'],
    }),
    PrismaModule,
    RedisModule,
    UsersModule,
    AuthModule,
    IssuesModule,
    MeModule,
    AdminModule,
    ReposModule,
    UploadsModule,
    DashboardModule,
  ],
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/redis/redis.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): add global RedisModule to AppModule"
```

---

### Task 4: Replace DashboardCacheService internals with Redis

**Files:**
- Modify: `apps/api/src/dashboard/dashboard-cache.service.ts`

- [ ] **Step 1: Rewrite dashboard-cache.service.ts**

Replace the entire content of `apps/api/src/dashboard/dashboard-cache.service.ts` with:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

/** Dashboard module cache key 的共同 prefix，用於一次清除。 */
export const DASHBOARD_CACHE_PREFIX = 'dashboard:';

/** 預設 TTL：5 分鐘。 */
export const DASHBOARD_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * DashboardCacheService
 * ---------------------------------------------------------------
 * Redis-backed TTL cache，滿足以下需求：
 *   1. `getOrLoad(key, loader, ttlMs?)`：cache hit 直接回傳，miss 才呼叫 loader
 *   2. `deleteByPrefix(prefix)`：一次清掉所有以某 prefix 開頭的 key（refresh-data 用）
 *   3. TTL 由 Redis 原生管理（PX 毫秒模式），不需 lazy eviction
 *
 * 公開介面與舊版 in-memory 實作完全相同，消費端（DashboardService、
 * DashboardController、AdminDashboardController）不需改動。
 */
@Injectable()
export class DashboardCacheService {
  private readonly logger = new Logger(DashboardCacheService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * 取得 cache value；未命中或過期則呼叫 loader 取得新值並寫入 cache。
   * loader 的 Promise 失敗會**直接 rethrow**，不污染 cache。
   */
  async getOrLoad<T>(
    key: string,
    loader: () => Promise<T>,
    ttlMs: number = DASHBOARD_CACHE_TTL_MS,
  ): Promise<T> {
    const hit = await this.redis.get<T>(key);
    if (hit !== null) {
      return hit;
    }
    const value = await loader();
    await this.redis.set(key, value, ttlMs);
    return value;
  }

  /** 寫入 cache，附 TTL。 */
  async set<T>(key: string, value: T, ttlMs: number = DASHBOARD_CACHE_TTL_MS): Promise<void> {
    await this.redis.set(key, value, ttlMs);
  }

  /**
   * 刪除所有以 prefix 開頭的 key。
   * 回傳實際刪除筆數。
   */
  async deleteByPrefix(prefix: string): Promise<number> {
    return this.redis.deleteByPrefix(prefix);
  }
}
```

- [ ] **Step 2: Check for consumers that need updating**

The `set` method changed from sync to async. Check if any caller doesn't await it:

```bash
cd /Users/powerhouse/Documents/works/ai-projects/Zenbu/zenbu-roadmaps
grep -rn '\.set(' apps/api/src/dashboard/ --include='*.ts' | grep -v 'cache.service'
```

If `DashboardService` calls `this.cache.set(...)` without `await`, add `await`. Similarly check `deleteByPrefix` — it was previously sync (`number` return), now async (`Promise<number>` return).

```bash
grep -rn 'deleteByPrefix\|\.set(' apps/api/src/dashboard/ --include='*.ts' | grep -v 'cache.service'
```

For each hit, ensure `await` is added. The callers are in `dashboard.service.ts` (inside `getOrLoad` callback — no direct `.set` calls) and `admin-dashboard.controller.ts` (calls `deleteByPrefix`).

- [ ] **Step 3: Update admin-dashboard.controller.ts if needed**

Read `apps/api/src/dashboard/admin-dashboard.controller.ts` and check the `deleteByPrefix` call. If it's not awaited, add `await`. The controller method that calls it should already be `async`.

- [ ] **Step 4: Verify typecheck passes**

```bash
cd /Users/powerhouse/Documents/works/ai-projects/Zenbu/zenbu-roadmaps
pnpm --filter api exec tsc --noEmit --pretty 2>&1 | head -30
```

Expected: no errors in dashboard-cache.service.ts or its consumers. (main.ts errors from connect-pg-simple removal are expected — fixed in Task 5.)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/dashboard/dashboard-cache.service.ts
# Also add any consumer files that needed await changes
git commit -m "feat(api): replace in-memory dashboard cache with Redis"
```

---

### Task 5: Replace session store with connect-redis

**Files:**
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: Update imports in main.ts**

Replace the `connect-pg-simple` import (line 5):

```typescript
// Remove this line:
import connectPgSimple from 'connect-pg-simple';

// Add this line:
import RedisStore from 'connect-redis';
```

Add the RedisService import:
```typescript
import { RedisService } from './redis/redis.service';
```

- [ ] **Step 2: Replace session store setup**

Replace the session store block in `main.ts`. Find the block from line 119 to line 135:

```typescript
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
```

Replace with:

```typescript
  // --------------------------------------------------------------
  // Session store：用 Redis 持久化
  //   - 比 PostgreSQL 更快（~1-2ms vs ~5-10ms per request）
  //   - Pod 重啟不影響已登入使用者
  //   - prefix 'sess:' 與 dashboard cache 'dashboard:' 隔離
  // --------------------------------------------------------------
  const redisService = app.get(RedisService);
  const sessionStore = new RedisStore({
    client: redisService.getClient(),
    prefix: 'sess:',
    ttl: 7 * 24 * 60 * 60, // 7 天（秒），與 cookie maxAge 一致
  });
```

- [ ] **Step 3: Remove the DATABASE_URL check that was only for session**

The `DATABASE_URL` check at lines 125-128 was only needed for the session store. However, Prisma still needs `DATABASE_URL`, so check if it's validated elsewhere. If Prisma already validates it at startup (it does — PrismaModule connects on init), this check can be safely removed.

Remove:
```typescript
  const databaseUrl = config.get<string>('DATABASE_URL');
  if (!databaseUrl) {
    throw new Error('DATABASE_URL 未設定，請檢查 .env');
  }
```

- [ ] **Step 4: Verify typecheck passes**

```bash
cd /Users/powerhouse/Documents/works/ai-projects/Zenbu/zenbu-roadmaps
pnpm --filter api exec tsc --noEmit --pretty
```

Expected: no errors.

- [ ] **Step 5: Verify build passes**

```bash
pnpm --filter api build
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/main.ts
git commit -m "feat(api): replace PostgreSQL session store with Redis"
```

---

### Task 6: Add REDIS_URL to .env.example

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add REDIS_URL section**

In `.env.example`, add a new Redis section after the Database section (after line 30). Insert after the `DATABASE_URL` line:

```
# ------- Redis -------
# 本地開發可用 Docker：docker run -d --name zenbu-roadmaps-redis -p 6379:6379 redis:7-alpine
# 正式部署：由 Helm chart 自動建立 Redis StatefulSet 並注入 REDIS_URL
REDIS_URL=redis://localhost:6379
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add REDIS_URL to .env.example"
```

---

### Task 7: Add redis section to Helm values.yaml

**Files:**
- Modify: `helm/zenbu-roadmaps/values.yaml`

- [ ] **Step 1: Add redis config block**

Append after the `migration` block (after line 67) in `helm/zenbu-roadmaps/values.yaml`:

```yaml

# Redis
redis:
  enabled: true
  image: redis:7-alpine
  password: change-me
  storage: 1Gi
  storageClass: local-path
  port: 6379
```

- [ ] **Step 2: Add REDIS_URL to api.secrets**

In the `api.secrets` section, add the `REDIS_URL` key. Insert after the `DATABASE_URL` line (line 19):

```yaml
    REDIS_URL: "redis://:change-me@zenburoadmaps-redis:6379/0"
```

- [ ] **Step 3: Validate YAML**

```bash
cd /Users/powerhouse/Documents/works/ai-projects/Zenbu/zenbu-roadmaps
helm lint helm/zenbu-roadmaps -f helm/zenbu-roadmaps/values.yaml
```

Expected: 0 failures.

- [ ] **Step 4: Commit**

```bash
git add helm/zenbu-roadmaps/values.yaml
git commit -m "feat(helm): add Redis config and REDIS_URL secret to values.yaml"
```

---

### Task 8: Create Redis Helm template (StatefulSet + Service)

**Files:**
- Create: `helm/zenbu-roadmaps/templates/redis.yaml`

- [ ] **Step 1: Create redis.yaml**

Create `helm/zenbu-roadmaps/templates/redis.yaml` with the following content:

```yaml
{{- if .Values.redis.enabled }}
apiVersion: v1
kind: Service
metadata:
  name: {{ include "zenbu-roadmaps.name" . }}-redis
  namespace: {{ .Values.namespace }}
  labels:
    app: {{ include "zenbu-roadmaps.name" . }}-redis
    {{- include "zenbu-roadmaps.labels" . | nindent 4 }}
spec:
  selector:
    app: {{ include "zenbu-roadmaps.name" . }}-redis
  ports:
    - port: {{ .Values.redis.port }}
      targetPort: {{ .Values.redis.port }}
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: {{ include "zenbu-roadmaps.name" . }}-redis
  namespace: {{ .Values.namespace }}
  labels:
    app: {{ include "zenbu-roadmaps.name" . }}-redis
    {{- include "zenbu-roadmaps.labels" . | nindent 4 }}
spec:
  serviceName: {{ include "zenbu-roadmaps.name" . }}-redis
  replicas: 1
  selector:
    matchLabels:
      app: {{ include "zenbu-roadmaps.name" . }}-redis
  template:
    metadata:
      labels:
        app: {{ include "zenbu-roadmaps.name" . }}-redis
    spec:
      containers:
        - name: redis
          image: {{ .Values.redis.image }}
          command:
            - redis-server
            - --requirepass
            - $(REDIS_PASSWORD)
            - --appendonly
            - "yes"
          ports:
            - containerPort: {{ .Values.redis.port }}
          env:
            - name: REDIS_PASSWORD
              value: {{ .Values.redis.password | quote }}
          volumeMounts:
            - name: data
              mountPath: /data
          readinessProbe:
            exec:
              command:
                - sh
                - -c
                - redis-cli -a $REDIS_PASSWORD ping | grep -q PONG
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            exec:
              command:
                - sh
                - -c
                - redis-cli -a $REDIS_PASSWORD ping | grep -q PONG
            initialDelaySeconds: 15
            periodSeconds: 30
          resources:
            requests:
              memory: 64Mi
              cpu: 50m
            limits:
              memory: 256Mi
              cpu: 200m
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: {{ .Values.redis.storageClass }}
        resources:
          requests:
            storage: {{ .Values.redis.storage }}
{{- end }}
```

- [ ] **Step 2: Verify Helm template renders**

```bash
cd /Users/powerhouse/Documents/works/ai-projects/Zenbu/zenbu-roadmaps
helm template zenburoadmaps helm/zenbu-roadmaps -f helm/zenbu-roadmaps/values.yaml -s templates/redis.yaml
```

Expected: renders Service + StatefulSet with name `zenburoadmaps-redis`, port 6379, image `redis:7-alpine`, appendonly enabled, password-protected.

- [ ] **Step 3: Verify disabled state**

```bash
helm template zenburoadmaps helm/zenbu-roadmaps -f helm/zenbu-roadmaps/values.yaml --set redis.enabled=false -s templates/redis.yaml
```

Expected: empty output.

- [ ] **Step 4: Commit**

```bash
git add helm/zenbu-roadmaps/templates/redis.yaml
git commit -m "feat(helm): add Redis StatefulSet + Service template"
```

---

### Task 9: Full validation

- [ ] **Step 1: Render all Helm templates**

```bash
cd /Users/powerhouse/Documents/works/ai-projects/Zenbu/zenbu-roadmaps
helm template zenburoadmaps helm/zenbu-roadmaps -f helm/zenbu-roadmaps/values.yaml > /tmp/redis-rendered.yaml && echo "Template OK"
```

Expected: `Template OK`, no errors.

- [ ] **Step 2: Verify Redis resources in rendered output**

```bash
grep -A2 'kind: StatefulSet' /tmp/redis-rendered.yaml | grep 'name:.*redis'
grep -A2 'kind: Service' /tmp/redis-rendered.yaml | grep 'name:.*redis'
grep 'REDIS_URL' /tmp/redis-rendered.yaml
```

Expected: `zenburoadmaps-redis` StatefulSet and Service present; `REDIS_URL` in secret stringData.

- [ ] **Step 3: Helm dry-run against cluster**

```bash
helm upgrade zenbu-roadmaps helm/zenbu-roadmaps -n zenburoadmaps-prod -f helm/zenbu-roadmaps/values.yaml --dry-run 2>&1 | grep -E '(kind:|redis|REDIS_URL|Error)' | head -20
```

Expected: renders successfully with Redis resources.

- [ ] **Step 4: Full NestJS typecheck**

```bash
cd /Users/powerhouse/Documents/works/ai-projects/Zenbu/zenbu-roadmaps
pnpm typecheck
```

Expected: all three workspaces (shared, api, web) pass with no errors.

- [ ] **Step 5: Full build**

```bash
pnpm build
```

Expected: build succeeds for all workspaces.

- [ ] **Step 6: Commit if any remaining changes**

```bash
git status
# If clean, skip. Otherwise:
git add -A
git commit -m "feat: Redis integration — complete"
```
