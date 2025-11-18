# Redis Implementation Step-by-Step Guide

## Overview
This guide provides a structured approach to implementing Redis caching in WanWatch. The implementation follows a phased approach prioritized by impact and complexity.

## Phase 1: Setup & Infrastructure

### Step 1.1: Add Dependencies
```bash
npm install ioredis
npm install --save-dev @types/ioredis
```

### Step 1.2: Create Redis Client Module
Create `/home/user/wanwatch/lib/redis.ts`:

```typescript
import Redis from 'ioredis';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';

let redis: Redis | null = null;

// Initialize on demand
function getRedis(): Redis | null {
  if (!redis && env.REDIS_URL) {
    try {
      redis = new Redis(env.REDIS_URL, {
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      });
      
      redis.on('error', (err) => {
        logger.warn('Redis connection error', { error: err.message });
      });
      
      redis.on('connect', () => {
        logger.info('Redis connected');
      });
    } catch (error) {
      logger.warn('Failed to initialize Redis', { error });
      return null;
    }
  }
  return redis;
}

export async function getCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number = 300
): Promise<T> {
  const redis = getRedis();
  
  if (!redis) {
    // Fallback to direct fetcher if Redis unavailable
    return fetcher();
  }
  
  try {
    // Check cache
    const cached = await redis.get(key);
    if (cached) {
      logger.debug('Cache hit', { key });
      return JSON.parse(cached);
    }
  } catch (error) {
    logger.warn('Redis cache check failed', { key, error });
    // Continue to database query
  }

  // Cache miss - fetch data
  const result = await fetcher();
  
  // Store in cache
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(result));
  } catch (error) {
    logger.warn('Redis cache write failed', { key, error });
    // Cache failure shouldn't block response
  }

  return result;
}

export async function invalidateCache(...keys: string[]): Promise<void> {
  const redis = getRedis();
  
  if (!redis) {
    return;
  }
  
  try {
    if (keys.length > 0) {
      await redis.del(...keys);
      logger.debug('Cache invalidated', { keys, count: keys.length });
    }
  } catch (error) {
    logger.warn('Redis cache invalidation failed', { keys, error });
  }
}

export async function invalidateCacheByPattern(pattern: string): Promise<void> {
  const redis = getRedis();
  
  if (!redis) {
    return;
  }
  
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
      logger.debug('Cache pattern invalidated', { pattern, count: keys.length });
    }
  } catch (error) {
    logger.warn('Redis pattern invalidation failed', { pattern, error });
  }
}

export async function getRedisStatus(): Promise<'connected' | 'disconnected'> {
  const redis = getRedis();
  
  if (!redis) {
    return 'disconnected';
  }
  
  try {
    await redis.ping();
    return 'connected';
  } catch {
    return 'disconnected';
  }
}

export function closeRedis(): void {
  if (redis) {
    redis.disconnect();
    redis = null;
  }
}
```

### Step 1.3: Update Environment Variables
Add to `.env.example`:
```bash
# Redis Cache (optional)
REDIS_URL=redis://localhost:6379/0
```

### Step 1.4: Update Docker Compose
Add to `docker-compose.yml`:

```yaml
services:
  wanwatch:
    # ... existing config ...
    environment:
      REDIS_URL: redis://redis:6379/0
    depends_on:
      redis:
        condition: service_healthy

  redis:
    image: redis:7-alpine
    container_name: wanwatch_redis
    ports:
      - "6379:6379"
    command: redis-server --appendonly no
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

---

## Phase 2: High-Impact Caches

### Cache Implementation 1: Chart Data Caching

**File**: `/home/user/wanwatch/app/api/stats/chart-data/route.ts`
**Lines to modify**: 130-220

**Current code** (lines 161-171):
```typescript
const checks = await prisma.connectionCheck.findMany({
  where: {
    timestamp: { gte: cutoffTime }
  },
  orderBy: { timestamp: 'asc' },
  take: MAX_POINTS,
  select: {
    timestamp: true,
    isConnected: true,
  }
});
```

**Modified code**:
```typescript
import { getCached, invalidateCache } from '@/lib/redis';

// Inside GET handler, after validation
const cacheKey = `chart:${period}`;
const ttlMap = {
  '5m': 30,
  '15m': 30,
  '1h': 30,
  '6h': 60,
  '24h': 120,
  'all': 300
};

// Fetch and parse cached data
let chartData: ChartDataPoint[] = [];

try {
  const cachedResponse = await getCached(
    cacheKey,
    async () => {
      const checks = await prisma.connectionCheck.findMany({
        where: {
          timestamp: { gte: cutoffTime }
        },
        orderBy: { timestamp: 'asc' },
        take: MAX_POINTS,
        select: {
          timestamp: true,
          isConnected: true,
        }
      });

      // Warn if we hit the limit
      if (checks.length === MAX_POINTS) {
        await logger.warn('Chart data query hit MAX_POINTS limit - data truncated', {
          period,
          cutoffTime: cutoffTime.toISOString(),
          maxPoints: MAX_POINTS,
          userId: session.user?.email ?? undefined
        });
      }

      // Perform server-side downsampling
      return downsampleData(checks, getTargetBuckets(period));
    },
    ttlMap[period as TimePeriod]
  );

  chartData = cachedResponse;
} catch (error) {
  // Fallback to direct query if cache fails
  const checks = await prisma.connectionCheck.findMany({...});
  chartData = downsampleData(checks, getTargetBuckets(period));
}

return NextResponse.json(
  { chartData },
  {
    headers: {
      'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
    },
  }
);
```

**Invalidation code** in `/home/user/wanwatch/lib/monitoring/connectivity-checker.ts`:

Add after line 91 (after connectionCheck.create):
```typescript
// Invalidate all chart period caches
const { invalidateCacheByPattern } = await import('@/lib/redis');
await invalidateCacheByPattern('chart:*');
```

---

### Cache Implementation 2: Aggregate (Total Downtime)

**File**: `/home/user/wanwatch/app/api/stats/route.ts`
**Lines to modify**: 20-47

**Current code**:
```typescript
const [
  totalOutages,
  activeOutage,
  outageHistory,
  latestSpeedTest
] = await Promise.all([
  prisma.outage.count({ where: { isResolved: true } }),
  prisma.outage.findFirst({ where: { isResolved: false } }),
  prisma.outage.findMany({
    take: 50,
    orderBy: { startTime: 'desc' },
    where: { isResolved: true }
  }),
  prisma.speedTest.findFirst({
    orderBy: { timestamp: 'desc' },
    select: {
      downloadMbps: true,
      uploadMbps: true,
      pingMs: true,
      timestamp: true
    }
  })
]);

const totalDowntime = await prisma.outage.aggregate({
  where: { isResolved: true },
  _sum: { durationSec: true }
});
```

**Modified code**:
```typescript
import { getCached } from '@/lib/redis';

// Fetch aggregate in parallel with other queries
const [
  totalOutages,
  activeOutage,
  outageHistory,
  latestSpeedTest,
  totalDowntime
] = await Promise.all([
  prisma.outage.count({ where: { isResolved: true } }),
  prisma.outage.findFirst({ where: { isResolved: false } }),
  prisma.outage.findMany({
    take: 50,
    orderBy: { startTime: 'desc' },
    where: { isResolved: true }
  }),
  prisma.speedTest.findFirst({
    orderBy: { timestamp: 'desc' },
    select: {
      downloadMbps: true,
      uploadMbps: true,
      pingMs: true,
      timestamp: true
    }
  }),
  getCached(
    'stats:totalDowntime',
    () => prisma.outage.aggregate({
      where: { isResolved: true },
      _sum: { durationSec: true }
    }),
    300 // 5 minute TTL
  )
]);
```

**Invalidation code** in `/home/user/wanwatch/lib/monitoring/connectivity-checker.ts`:

Add after line 195 (after outage.update when resolved):
```typescript
// Invalidate aggregate cache when outage resolves
const { invalidateCache } = await import('@/lib/redis');
await invalidateCache('stats:totalDowntime');
```

---

### Cache Implementation 3: Latest Speed Test

**File**: `/home/user/wanwatch/app/api/stats/route.ts`
**Lines to modify**: 33-41

**Current code**:
```typescript
latestSpeedTest: await prisma.speedTest.findFirst({
  orderBy: { timestamp: 'desc' },
  select: {
    downloadMbps: true,
    uploadMbps: true,
    pingMs: true,
    timestamp: true
  }
})
```

**Modified code**:
```typescript
latestSpeedTest: await getCached(
  'speedtest:latest',
  () => prisma.speedTest.findFirst({
    orderBy: { timestamp: 'desc' },
    select: {
      downloadMbps: true,
      uploadMbps: true,
      pingMs: true,
      timestamp: true
    }
  }),
  1800 // 30 minute TTL
)
```

**Invalidation code** in `/home/user/wanwatch/lib/monitoring/speed-tester.ts`:

Add after line 131 (after speedTest.create):
```typescript
// Invalidate speed test cache
const { invalidateCache } = await import('@/lib/redis');
await invalidateCache('speedtest:latest');
```

---

### Cache Implementation 4: Monitoring Settings

**File**: `/home/user/wanwatch/lib/settings.ts`
**Lines to modify**: 17-35

**Current code**:
```typescript
export async function getMonitoringIntervals(): Promise<MonitoringIntervals> {
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: SETTINGS_ID }
    });

    if (settings) {
      logger.debug('Loaded monitoring intervals from database', {
        checkIntervalSeconds: settings.checkIntervalSeconds,
        outageCheckIntervalSeconds: settings.outageCheckIntervalSeconds
      });

      return {
        checkIntervalSeconds: settings.checkIntervalSeconds,
        outageCheckIntervalSeconds: settings.outageCheckIntervalSeconds
      };
    }
```

**Modified code**:
```typescript
import { getCached, invalidateCache } from '@/lib/redis';

export async function getMonitoringIntervals(): Promise<MonitoringIntervals> {
  try {
    const settings = await getCached(
      'settings:monitoring',
      async () => {
        return await prisma.settings.findUnique({
          where: { id: SETTINGS_ID }
        });
      },
      3600 // 1 hour TTL - invalidated on update
    );

    if (settings) {
      logger.debug('Loaded monitoring intervals from database', {
        checkIntervalSeconds: settings.checkIntervalSeconds,
        outageCheckIntervalSeconds: settings.outageCheckIntervalSeconds
      });

      return {
        checkIntervalSeconds: settings.checkIntervalSeconds,
        outageCheckIntervalSeconds: settings.outageCheckIntervalSeconds
      };
    }
```

**Invalidation code** in `/home/user/wanwatch/app/api/settings/monitoring/route.ts`:

Add after line 88 (after updateMonitoringIntervals):
```typescript
// Invalidate settings cache
const { invalidateCache } = await import('@/lib/redis');
await invalidateCache('settings:monitoring');
```

Also add after line 57 (after resetToDefaultIntervals):
```typescript
// Invalidate settings cache
const { invalidateCache } = await import('@/lib/redis');
await invalidateCache('settings:monitoring');
```

---

## Phase 3: Testing

### Test Case 1: Cache Invalidation
Create `/home/user/wanwatch/__tests__/lib/redis.test.ts`:

```typescript
import { getCached, invalidateCache } from '@/lib/redis';

describe('Redis Cache', () => {
  it('returns cached data on second call', async () => {
    let callCount = 0;
    const fetcher = async () => {
      callCount++;
      return { value: 'test' };
    };

    const result1 = await getCached('test:key', fetcher, 300);
    const result2 = await getCached('test:key', fetcher, 300);

    expect(result1).toEqual(result2);
    // Note: if Redis is enabled, callCount should be 1
    // If Redis is disabled, callCount should be 2
  });

  it('returns fresh data after invalidation', async () => {
    let callCount = 0;
    const fetcher = async () => {
      callCount++;
      return { count: callCount };
    };

    await getCached('test:key2', fetcher, 300);
    await invalidateCache('test:key2');
    await getCached('test:key2', fetcher, 300);

    // Should fetch twice due to invalidation
    expect(callCount).toBeGreaterThanOrEqual(2);
  });
});
```

### Manual Test: Chrome DevTools
1. Open WanWatch dashboard
2. Open Chrome DevTools → Network tab
3. Filter by `/api/stats`
4. Watch response times:
   - **First request**: 100-200ms (database)
   - **Subsequent requests (within 30s)**: 10-50ms (cache)

---

## Phase 4: Validation & Monitoring

### Add Performance Metrics
In each API route using cache, add:

```typescript
const startTime = performance.now();
const result = await getCached(key, fetcher, ttl);
const duration = performance.now() - startTime;

await logger.debug('API cache performance', {
  endpoint: '/api/stats',
  duration: duration.toFixed(2),
  cached: duration < 10, // Redis hits are typically <10ms
  cacheKey: key
});
```

### Monitor Cache Hit Rate
Add periodically to logs:

```typescript
// In a scheduled task or healthcheck
const pattern = 'chart:*';
const keys = await redis.keys(pattern);
logger.info('Cache stats', {
  chartCacheKeys: keys.length,
  estimatedMemoryUsage: `${(keys.length * 2).toFixed(1)} KB`
});
```

---

## Troubleshooting

### Redis Connection Issues
If Redis fails to connect:
- Check `REDIS_URL` environment variable
- Verify Redis container is running: `docker ps | grep redis`
- Check Redis logs: `docker logs wanwatch_redis`
- Verify no firewall blocking port 6379

### Cache Not Invalidating
- Check invalidation code is called after write operations
- Verify cache keys match between invalidation and retrieval
- Check Redis CLI: `redis-cli KEYS "*"` to see stored keys

### Stale Data Issues
If users see stale data:
- Review TTL values (may be too long)
- Verify cache keys are specific (not shared)
- Check that related caches are invalidated together

### Memory Issues
If Redis memory grows too large:
- Set `MAXMEMORY` policy in Redis config
- Reduce TTL values
- Add pattern-based cleanup of expired keys

---

## Rollback Procedure

If Redis needs to be removed:

1. Remove `REDIS_URL` from environment
2. Remove `ioredis` from `package.json`
3. Comment out Redis initialization in `/lib/redis.ts`
4. App automatically falls back to direct database queries
5. No other code changes needed

---

## Performance Expectations

### Before Redis
```
4 concurrent users, 3 months data (26k checks):
- /api/stats: 100-200ms
- /api/stats/chart-data: 500-1000ms
- Dashboard load: 2-3 seconds
- DB I/O per hour: 9-12 seconds
```

### After Redis (Phase 1)
```
Same scenario with chart + aggregate caching:
- /api/stats: 10-50ms (80-90% faster)
- /api/stats/chart-data: 50-100ms (80-90% faster)
- Dashboard load: 200-300ms (85% faster)
- DB I/O per hour: <1 second (90% reduction)
- Cache hit rate: 85-95%
```

