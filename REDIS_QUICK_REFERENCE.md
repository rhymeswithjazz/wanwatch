# Redis Implementation Quick Reference

## Key Files to Modify (Phase 1)

### 1. Chart Data Caching
**File**: `/home/user/wanwatch/app/api/stats/chart-data/route.ts`
**Current Code**: Lines 161-171 (database query)
**Action**: Wrap in Redis cache check before query

```typescript
// Before: Direct database query
const checks = await prisma.connectionCheck.findMany({...});

// After: Cache-aware query
const cacheKey = `chart:${period}`;
const cachedData = await redis.get(cacheKey);
if (cachedData) {
  return JSON.parse(cachedData);
}
// ... query database
await redis.setex(cacheKey, getTTL(period), JSON.stringify(chartData));
```

**Invalidation Point**: `/home/user/wanwatch/lib/monitoring/connectivity-checker.ts:84`
- After `prisma.connectionCheck.create()`
- Invalidate: `chart:5m`, `chart:15m`, `chart:1h`, `chart:6h`, `chart:24h`, `chart:all`

---

### 2. Aggregate Cache (Total Downtime)
**File**: `/home/user/wanwatch/app/api/stats/route.ts`
**Current Code**: Lines 44-47 (aggregate query)

```typescript
// Before: Direct aggregate
const totalDowntime = await prisma.outage.aggregate({
  where: { isResolved: true },
  _sum: { durationSec: true }
});

// After: Cache-aware
const cacheKey = 'stats:totalDowntime';
let totalDowntime = await redis.get(cacheKey);
if (!totalDowntime) {
  totalDowntime = await prisma.outage.aggregate({...});
  await redis.setex(cacheKey, 300, JSON.stringify(totalDowntime));
} else {
  totalDowntime = JSON.parse(totalDowntime);
}
```

**Invalidation Point**: `/home/user/wanwatch/lib/monitoring/connectivity-checker.ts:189`
- After outage resolved (isResolved = true)
- Invalidate: `stats:totalDowntime`

---

### 3. Latest Speed Test Cache
**File**: `/home/user/wanwatch/app/api/stats/route.ts`
**Current Code**: Lines 33-41 (latest speed test query)

```typescript
// Before:
const latestSpeedTest = await prisma.speedTest.findFirst({
  orderBy: { timestamp: 'desc' },
  select: {...}
});

// After:
const cacheKey = 'speedtest:latest';
let latestSpeedTest = await redis.get(cacheKey);
if (!latestSpeedTest) {
  latestSpeedTest = await prisma.speedTest.findFirst({...});
  await redis.setex(cacheKey, 1800, JSON.stringify(latestSpeedTest));
} else {
  latestSpeedTest = JSON.parse(latestSpeedTest);
}
```

**Invalidation Point**: `/home/user/wanwatch/lib/monitoring/speed-tester.ts:96`
- After `prisma.speedTest.create()`
- Invalidate: `speedtest:latest`

---

### 4. Monitoring Settings Cache
**File**: `/home/user/wanwatch/lib/settings.ts`
**Current Code**: Lines 17-23 (getMonitoringIntervals)

```typescript
// Before:
const settings = await prisma.settings.findUnique({
  where: { id: SETTINGS_ID }
});

// After:
const cacheKey = 'settings:monitoring';
let settings = await redis.get(cacheKey);
if (!settings) {
  settings = await prisma.settings.findUnique({...});
  if (settings) {
    await redis.set(cacheKey, JSON.stringify(settings));
  }
} else {
  settings = JSON.parse(settings);
}
```

**Invalidation Point**: `/home/user/wanwatch/app/api/settings/monitoring/route.ts:97`
- After `updateMonitoringIntervals()` call
- Invalidate: `settings:monitoring`

---

## New File to Create

### Redis Client Module
**File**: `/home/user/wanwatch/lib/redis.ts`
**Purpose**: Centralized Redis client and helper functions

```typescript
import Redis from 'ioredis';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';

const redis = env.REDIS_URL ? new Redis(env.REDIS_URL) : null;

export async function getCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = 300
): Promise<T> {
  if (!redis) return fetcher();
  
  try {
    const cached = await redis.get(key);
    if (cached) {
      logger.debug('Cache hit', { key });
      return JSON.parse(cached);
    }
  } catch (error) {
    logger.warn('Redis get error', { key, error });
  }

  const result = await fetcher();
  
  try {
    await redis.setex(key, ttl, JSON.stringify(result));
  } catch (error) {
    logger.warn('Redis set error', { key, error });
  }

  return result;
}

export async function invalidateCache(...keys: string[]): Promise<void> {
  if (!redis) return;
  
  try {
    if (keys.length > 0) {
      await redis.del(...keys);
      logger.debug('Cache invalidated', { keys });
    }
  } catch (error) {
    logger.warn('Redis del error', { keys, error });
  }
}

export async function getRedisStatus(): Promise<'connected' | 'disconnected'> {
  if (!redis) return 'disconnected';
  try {
    await redis.ping();
    return 'connected';
  } catch {
    return 'disconnected';
  }
}
```

---

## Database Query Costs (Performance Metrics)

### Current Baseline (without Redis)

| Query | Frequency | Time/Query | Total/Hour | Bottleneck? |
|-------|-----------|-----------|-----------|------------|
| `/api/stats` aggregate | 1/min per user | 10-20ms | 600-1200ms | YES |
| `/api/stats/chart-data` | 2/min per user | 50-100ms | 6-12 seconds | YES |
| `/api/stats` (other 4 queries) | 1/min per user | 5-10ms | 300-600ms | No |
| `/api/logs` count | 2/min per user | 2-5ms | 120-300ms | No |
| `/api/logs` findMany | 2/min per user | 10-20ms | 600-1200ms | No |
| `/api/speedtest` | 1/page visit | 15-25ms | Occasional | No |
| `getMonitoringIntervals` | 1/30s scheduler | 1-2ms | ~120ms | No |
| Active outage check | 1/30s scheduler | 5-10ms | ~600ms | No |

**Totals per 4-user, 1-hour load test**:
- Database I/O time: ~9-12 seconds
- Query count: 2,400-3,200 queries
- Largest queries: chart data (50,000 rows/query × 120 queries = 6M rows)

---

## Configuration Changes

### Add to `.env.example`
```bash
# Redis (optional)
REDIS_URL=redis://localhost:6379/0
REDIS_ENABLED=true
```

### Docker Compose Addition
```yaml
services:
  redis:
    image: redis:7-alpine
    container_name: wanwatch_redis
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3
    volumes:
      - redis_data:/data

volumes:
  redis_data:
```

### Update package.json
```json
{
  "dependencies": {
    "ioredis": "^5.3.0"
  }
}
```

---

## Testing Checklist

- [ ] Redis client connects without breaking app startup
- [ ] Graceful fallback if Redis unavailable
- [ ] Chart cache invalidates correctly
- [ ] Aggregate cache updates on outage resolution
- [ ] Speed test cache expires after 30 minutes
- [ ] Settings cache invalidates on update
- [ ] Multiple concurrent users don't see stale data
- [ ] Cache keys don't collide or overlap
- [ ] Performance improves measurably (use Chrome DevTools)

---

## Monitoring & Observability

### Add to API Routes
```typescript
const startTime = performance.now();
const result = await getCached(key, fetcher, ttl);
const duration = performance.now() - startTime;

logger.debug('API call completed', {
  endpoint: '/api/stats',
  duration: duration.toFixed(2),
  cached: duration < 10  // Redis hits typically <10ms
});
```

### Cache Hit/Miss Metrics
- Monitor `redis_hit` vs `redis_miss` in logs
- Target: 85%+ hit rate for chart data
- Target: 90%+ hit rate for aggregate cache

---

## Rollback Plan

If Redis causes issues:
1. Remove REDIS_URL from environment
2. Connections gracefully fall back to direct database
3. No code changes needed to revert
4. Clear any partially-cached data (Redis TTL handles auto-cleanup)

---

## Performance Verification (Before/After)

Use Chrome DevTools Network tab:

**Before Redis**:
- /api/stats: 100-200ms
- /api/stats/chart-data: 500-1000ms
- Total dashboard load: ~2 seconds

**After Redis (Phase 1)**:
- /api/stats: 10-50ms (90% reduction)
- /api/stats/chart-data: 50-100ms (90% reduction)
- Total dashboard load: ~200-300ms (85% faster)

