# Redis Integration Design

## Summary

Replace the in-memory dashboard cache (`Map`) and PostgreSQL session store (`connect-pg-simple`) with Redis. This eliminates cold-start latency after pod restarts, reduces PostgreSQL load from session lookups, and enables future multi-replica API scaling.

## Approach: ioredis + connect-redis

Use `ioredis` as the Redis client (CJS-compatible, industry standard). Wrap it in a global NestJS `RedisModule` that provides `RedisService` for dashboard caching and exposes the raw client for `connect-redis` session store.

### Why not alternatives

| Alternative | Rejected because |
|---|---|
| `@nestjs/cache-manager` + `cache-manager-redis-yet` | `cache-manager` v5 is ESM-only; project is CJS. Compatibility shims add complexity for no real gain. |
| `@nestjs/cache-manager` + ioredis adapter | Adapter poorly maintained compared to direct ioredis usage. |
| Keep in-memory cache | Pod restart = 5-10s cold start on `/api/summary`; blocks multi-replica scaling. |

## Changes

### 1. Helm: Redis StatefulSet + Service + PVC

**New file**: `helm/zenbu-roadmaps/templates/redis.yaml`

Deploy Redis 7 Alpine as a StatefulSet (matching PostgreSQL pattern):

```yaml
# StatefulSet
- image: redis:7-alpine
- replicas: 1
- command: redis-server --requirepass $(REDIS_PASSWORD)
- port: 6379
- volumeMount: /data (PVC, 1Gi, local-path)
- readinessProbe: redis-cli -a $REDIS_PASSWORD ping

# Service
- name: {{ name }}-redis
- port: 6379 → targetPort: 6379
- clusterIP (internal only)
```

Conditional on `{{ if .Values.redis.enabled }}`.

### 2. Helm: Secret + API Deployment

**Modify**: `helm/zenbu-roadmaps/templates/secret.yaml`

Add `REDIS_URL` key:
```
redis://:{{ .Values.redis.password }}@{{ include "zenbu-roadmaps.name" . }}-redis:{{ .Values.redis.port }}/0
```

**Modify**: `helm/zenbu-roadmaps/templates/api-deployment.yaml`

Add env var `REDIS_URL` from secret:
```yaml
- name: REDIS_URL
  valueFrom:
    secretKeyRef:
      name: {{ include "zenbu-roadmaps.name" . }}-secrets
      key: REDIS_URL
```

### 3. Helm: values.yaml

**Modify**: `helm/zenbu-roadmaps/values.yaml`

Add `redis` section:
```yaml
redis:
  enabled: true
  image: redis:7-alpine
  password: change-me
  storage: 1Gi
  storageClass: local-path
  port: 6379
```

### 4. NestJS: RedisModule + RedisService

**New files**:
- `apps/api/src/redis/redis.module.ts`
- `apps/api/src/redis/redis.service.ts`

**RedisService** interface:
```typescript
@Injectable()
class RedisService implements OnModuleDestroy {
  private client: Redis;  // ioredis instance

  constructor(configService: ConfigService) {
    this.client = new Redis(configService.get<string>('REDIS_URL'));
  }

  async get<T>(key: string): Promise<T | null>
  // Redis GET → JSON.parse; return null on miss

  async set(key: string, value: unknown, ttlMs?: number): Promise<void>
  // JSON.stringify → Redis SET PX ttlMs (or no expiry if omitted)

  async del(key: string): Promise<void>
  // Redis DEL

  async deleteByPrefix(prefix: string): Promise<number>
  // SCAN + DEL pattern (not KEYS — safe for production)
  // Returns count of deleted keys

  getClient(): Redis
  // Expose raw ioredis client for connect-redis

  async onModuleDestroy(): Promise<void>
  // Graceful disconnect
}
```

**RedisModule**: `@Global()` module, imported once in `AppModule`.

**Value serialization**: `JSON.stringify` on write, `JSON.parse` on read. Consistent with current in-memory cache storing plain objects.

### 5. Dashboard Cache: Map → Redis

**Modify**: `apps/api/src/dashboard/dashboard-cache.service.ts`

Replace internal `Map<string, CacheEntry>` with `RedisService` calls. Public interface unchanged:

| Method | Before (Map) | After (Redis) |
|---|---|---|
| `getOrLoad<T>(key, loader, ttlMs?)` | `map.get()` check expiry → hit/miss | `redis.get()` → hit/miss |
| `set<T>(key, value, ttlMs?)` | `map.set({ value, expiresAt })` | `redis.set(key, value, ttlMs)` |
| `deleteByPrefix(prefix)` | `for...of map.keys()` filter+delete | `redis.deleteByPrefix(prefix)` |

**TTL**: Unchanged at 5 minutes (`DASHBOARD_CACHE_TTL_MS = 300000`). Redis handles expiry natively via `PX` option.

**Key format**: Unchanged — `dashboard:summary`, `dashboard:repo:{owner}/{name}`, `dashboard:roadmap-issues:{owner}/{name}/{number}:p{page}:s{perPage}`.

**Consumers unaffected**: `DashboardService`, `DashboardController`, `AdminDashboardController` call `DashboardCacheService` — no changes needed.

### 6. Session Store: PostgreSQL → Redis

**Modify**: `apps/api/src/main.ts`

Replace `connect-pg-simple` with `connect-redis`:

```typescript
// Before
import PgSession from 'connect-pg-simple';
const store = new PgSession({
  conObject: { connectionString: databaseUrl },
  tableName: 'session',
  createTableIfMissing: true,
  pruneSessionInterval: 60 * 15,
});

// After
import RedisStore from 'connect-redis';
const redisService = app.get(RedisService);
const store = new RedisStore({
  client: redisService.getClient(),
  prefix: 'sess:',
  ttl: 7 * 24 * 60 * 60,  // 7 days in seconds (matches cookie maxAge)
});
```

All other session config unchanged: `secret`, `resave`, `saveUninitialized`, `cookie` settings remain as-is.

**PostgreSQL session table**: No longer used. Left in place (harmless); can be dropped in a future migration if desired.

### 7. Dependencies

**Add to `apps/api`**:
- `ioredis` — Redis client
- `connect-redis` — express-session Redis store
- `@types/connect-redis` (dev) — type definitions

**Remove from `apps/api`**:
- `connect-pg-simple` — no longer used
- `@types/connect-pg-simple` (dev) — no longer used

**Keep**: `pg` (used by Prisma indirectly)

### 8. AppModule

**Modify**: `apps/api/src/app.module.ts`

Add `RedisModule` to imports array.

## Key Isolation

Dashboard cache and sessions share the same Redis instance but are isolated by key prefix:

| Prefix | Owner | TTL |
|---|---|---|
| `dashboard:*` | DashboardCacheService | 5 minutes |
| `sess:*` | connect-redis (session store) | 7 days |

No prefix collision possible. `deleteByPrefix('dashboard:')` (admin refresh-data) only touches dashboard keys.

## Local Development

Add Redis to local dev setup:

```bash
docker run -d --name zenbu-roadmaps-redis -p 6379:6379 redis:7-alpine
```

`.env` add:
```
REDIS_URL=redis://localhost:6379
```

For password-protected local Redis:
```bash
docker run -d --name zenbu-roadmaps-redis -p 6379:6379 redis:7-alpine redis-server --requirepass dev
```
```
REDIS_URL=redis://:dev@localhost:6379
```

## File Summary

| Action | File |
|---|---|
| Create | `helm/zenbu-roadmaps/templates/redis.yaml` |
| Modify | `helm/zenbu-roadmaps/templates/secret.yaml` |
| Modify | `helm/zenbu-roadmaps/templates/api-deployment.yaml` |
| Modify | `helm/zenbu-roadmaps/values.yaml` |
| Create | `apps/api/src/redis/redis.module.ts` |
| Create | `apps/api/src/redis/redis.service.ts` |
| Modify | `apps/api/src/dashboard/dashboard-cache.service.ts` |
| Modify | `apps/api/src/main.ts` |
| Modify | `apps/api/src/app.module.ts` |
| Modify | `apps/api/package.json` (via pnpm add/remove) |

## Constraints

- `ioredis` is CJS-compatible — no ESM issues with NestJS build.
- `deleteByPrefix` must use `SCAN` (cursor-based), never `KEYS` (blocks Redis on large datasets).
- Redis StatefulSet uses `local-path` storage class (same as PostgreSQL) — data persists across pod restarts but not node loss.
- `connect-redis` v8+ requires `ioredis` v5+ — both are current stable versions.
- Existing sessions in PostgreSQL will be invalidated on deploy (users must re-login once). This is acceptable for a dashboard app.

## Performance Impact

| Metric | Before | After |
|---|---|---|
| `/api/summary` cold start | 5-10s (GitHub fetch) | 0ms if Redis has cache (survives pod restart) |
| Session lookup per request | ~5-10ms (PostgreSQL) | ~1-2ms (Redis) |
| Pod restart recovery | Full cold start | Instant (cache + sessions persist in Redis) |
| Multi-replica support | Not possible (in-memory cache) | Ready (Redis is shared) |
