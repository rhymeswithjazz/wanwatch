# WanWatch Redis Optimization Analysis

## Executive Summary

WanWatch is a single-instance monitoring application with moderate read volume from client polling but relatively light write operations. Redis would provide meaningful benefits primarily in three areas: **query result caching**, **session acceleration**, and **monitoring state optimization**. However, given the single-instance design and lightweight nature, adoption should be strategic and incremental.

---

## 1. Current Data Access Patterns

### API Routes and Query Frequency

#### High-Frequency Endpoints (Dashboard Polling)
**`GET /api/stats` - Called every 60 seconds per connected user**
- **Query Pattern**: 5 concurrent database operations (Promise.all)
  1. `prisma.outage.count()` - Counts resolved outages
  2. `prisma.outage.findFirst()` - Gets active outage (if exists)
  3. `prisma.outage.findMany(take: 50)` - Last 50 resolved outages (ordered DESC)
  4. `prisma.speedTest.findFirst()` - Latest speed test result
  5. `prisma.outage.aggregate()` - SUM of duration across ALL resolved outages
  
- **Volume**: 1 request/min per user = 60 req/hour per user; 240-960 req/hour if 4-16 users
- **Response Data Size**: ~2-5 KB (aggregations + metadata)
- **Cache-Control Headers**: Already set to 30s max-age (browser cache only)
- **Freshness Requirements**: 60 second polling interval

**`GET /api/stats/chart-data?period={period}` - Called every 30 seconds**
- **Query Pattern**: 
  ```typescript
  prisma.connectionCheck.findMany({
    where: { timestamp: { gte: cutoffTime } },
    orderBy: { timestamp: 'asc' },
    take: MAX_POINTS (50,000),
    select: { timestamp, isConnected }
  })
  ```
- **Data Size**: 2-200 data points (downsampled to 10-200 points depending on period)
- **Raw Query**: Up to 50,000 rows from database
- **Processing**: Server-side downsampling (CPU-bound, not I/O bound)
- **Volume**: 2 requests/min per user = 120 req/hour per user
- **Cache-Control**: 30s max-age

**`GET /api/logs?page=1&pageSize=50` - Called every 30 seconds**
- **Query Pattern**: 
  1. `prisma.systemLog.count(where)` - Count with optional filters
  2. `prisma.systemLog.findMany(where, skip, take)` - Paginated results
- **Volume**: 2 requests/min per user (optional, depending on page navigation)
- **Cache-Control**: `no-cache, no-store` (never cached)
- **Freshness**: Highly variable depending on user action

**`GET /api/speedtest` - Called on /speedtest page**
- **Query Pattern**:
  1. `prisma.speedTest.findFirst()` - Latest test
  2. `prisma.speedTest.findMany(take: 100)` - Last 100 tests
  3. Manual aggregation loop (JavaScript, not database)
- **Volume**: Once on page load + polling (varies)

#### Lower-Frequency Endpoints (Configuration)
**`GET /api/settings/monitoring` - Called on settings page load**
- **Query Pattern**: `prisma.settings.findUnique({ where: { id: 1 } })`
- **Volume**: Once per settings page visit

**`GET /api/network-info` - Called every 10 minutes**
- **Query Pattern**: External API call to ipify/maxmind
- **Volume**: 6 requests/hour per user

---

## 2. Key Performance Bottlenecks Identified

### Bottleneck #1: The Aggregate Query on /api/stats
**Location**: `app/api/stats/route.ts:44`
```typescript
const totalDowntime = await prisma.outage.aggregate({
  where: { isResolved: true },
  _sum: { durationSec: true }
});
```

**Problem**: 
- Runs on EVERY stats request (60 requests/hour per user)
- Must scan the entire `Outage` table to compute SUM
- Result is **identical** for hours/days at a time (only changes when new outage resolves)
- No indexes help with aggregate functions on full table scans
- With large datasets (1000+ outages), becomes measurably slow

**Current Mitigation**: Browser-level caching (30s) masks the issue but doesn't solve it

**Estimated Query Time**:
- 100 outages: ~2-5ms
- 1000 outages: ~10-20ms
- 10000 outages: ~50-100ms

### Bottleneck #2: Chart Data Fetching
**Location**: `app/api/stats/chart-data/route.ts:161`

**Problem**:
- Fetches up to 50,000 connection check records
- Called every 30 seconds per user
- SQLite's sequential I/O for large result sets is slow
- Network overhead transmitting 50,000 rows just to downsample to 200

**Performance Impact**:
- With 3 months of data at 5-minute intervals: ~26,000 rows
- At peak with multiple users: 4-6 requests/min for chart data alone

### Bottleneck #3: Monitoring Target List Loading
**Location**: `lib/monitoring/connectivity-checker.ts:33`

**Problem**:
- Loads enabled targets from database on every connectivity check
- Happens every 30 seconds (outage mode) to 5 minutes (normal mode)
- Uses in-memory cache (5-minute TTL) but hits DB if cache expires
- On scheduler restart, cache invalidates and reloads
- For 3-10 monitoring targets, the overhead is minor but non-zero

**Current Mitigation**: 5-minute TTL cache within ConnectivityChecker class

### Bottleneck #4: Settings Single-Row Pattern
**Location**: `lib/settings.ts:20`

**Problem**:
- Loads monitoring intervals on every check (via getMonitoringIntervals)
- Database query: `prisma.settings.findUnique({ where: { id: SETTINGS_ID } })`
- Gets called multiple times per minute (scheduler checks)
- Result is almost never changing

---

## 3. Real-Time Communication Patterns

### Current: Polling Architecture
- **Dashboard** (`components/stats-dashboard.tsx`):
  - `/api/stats` every 60 seconds (SWR hook)
  - `/api/stats/chart-data` every 30 seconds
  - `/api/network-info` every 10 minutes
  - Deduplication: 5s for stats, 60s for network-info

- **Logs Viewer** (`components/logs-viewer.tsx`):
  - `/api/logs` every 30 seconds with pagination
  - 10s deduplication interval
  - No cache headers

- **Speed Test Page**:
  - `/api/speedtest` on page load and optionally refreshed

**Assessment**:
- Polling is appropriate for this use case (monitoring dashboard, not real-time collab)
- Client-side SWR handles deduplication well
- Cache headers help but limited effectiveness without server-side cache

### What Redis Doesn't Help
- WebSocket upgrades not needed (polling works fine)
- Real-time notifications not currently implemented
- Session broadcast unnecessary (single-user typically)

---

## 4. Session Management Analysis

**Location**: `lib/auth.ts`

**Current Implementation**:
- NextAuth v5 with Credentials provider
- Password verified with bcrypt
- JWT-based sessions (no session table)
- Every request checks session via `auth()` call

**Database Queries**:
```typescript
const user = await prisma.user.findUnique({
  where: { email }
});
```

**Assessment**:
- Already uses JWT (stateless), so no session table queries
- Single Prisma query per auth attempt
- Redis would NOT help here (NextAuth already optimized)
- Focus is on preventing excessive auth checks, not caching

---

## 5. Background Job Patterns

### Scheduler Architecture (`lib/monitoring/scheduler.ts`)

**Connectivity Monitoring Loop**:
- Runs setInterval-based task every 30s-5min
- Calls `ConnectivityChecker.checkConnection()` 
- Per-check operations:
  1. Load targets from DB (cached, 5-min TTL)
  2. Ping targets sequentially
  3. Log result to ConnectionCheck table (write)
  4. Check active outage status (read)
  5. Create/update Outage record (write)
  6. Log to SystemLog if necessary (write)

**Speed Test Loop**:
- Runs every 30 minutes
- Executes Ookla CLI (external process, takes 2-5 minutes)
- Saves result to database (single write)

**Assessment**:
- Writes are already optimized (infrequent, append-only)
- Reads are minimal and already partially cached
- Redis wouldn't improve background performance significantly
- Current bottleneck is external (ping latency, Ookla CLI), not database

---

## 6. Specific Redis Use Cases with Estimated Benefits

### USE CASE 1: Aggregate Cache (HIGH PRIORITY)
**Problem**: Total downtime calculation rescanned on every stats request

**Redis Strategy**: Cache aggregate results for 5 minutes
```
Key: "stats:totalDowntime"
Value: { totalSeconds: 123456, count: 42 }
TTL: 300s
Invalidation: When new outage resolves (update) or reset happens
```

**Implementation**:
- Store in `/api/stats/route.ts` after calculating aggregate
- Check cache before running aggregate query
- Invalidate in `lib/monitoring/connectivity-checker.ts` when outage resolves

**Estimated Benefit**:
- Eliminates 90% of aggregate queries (keeping 1 per 5 min vs 60 per hour)
- Saves ~10-20ms per request × 55 fewer requests/hour = 550-1100ms saved per hour per user
- Query reduction: 60 queries/hour → 12 queries/hour (80% reduction)
- Impact: MEDIUM (saves 10-20ms per request but doesn't affect critical path much)

**Complexity**: LOW (single cache key, simple invalidation)

---

### USE CASE 2: Chart Data Caching (HIGH PRIORITY)
**Problem**: Fetches and processes 50,000 rows to return 200 points

**Redis Strategy**: Cache downsampled chart data by period
```
Keys:
  "chart:5m" → ChartDataPoint[] (TTL: 30s)
  "chart:15m" → ChartDataPoint[] (TTL: 30s)
  "chart:1h" → ChartDataPoint[] (TTL: 30s)
  "chart:6h" → ChartDataPoint[] (TTL: 60s)
  "chart:24h" → ChartDataPoint[] (TTL: 120s)
  "chart:all" → ChartDataPoint[] (TTL: 300s)

Invalidation: New ConnectionCheck written (append new point)
```

**Implementation**:
- Check cache first in `/api/stats/chart-data/route.ts`
- On cache miss: query database, downsample, cache result
- Invalidate in `lib/monitoring/connectivity-checker.ts` after writing ConnectionCheck

**Estimated Benefit**:
- Query reduction: 4-6 requests/min × 50,000 rows = 200k-300k rows/hour
- With Redis: 1 query per 30-300s = 12-120 queries/hour (90% reduction)
- Bandwidth savings: 50,000 rows × 4-6 requests = huge data transfer avoided
- Processing: Downsampling only happens once per 30s instead of 6x
- Impact: VERY HIGH (most expensive query eliminated)

**Complexity**: LOW-MEDIUM (cache invalidation slightly tricky)

---

### USE CASE 3: Latest SpeedTest Caching (MEDIUM PRIORITY)
**Problem**: Latest speed test queried 2-3x per stats request, every 60s

**Redis Strategy**: Cache latest speed test result
```
Key: "speedtest:latest"
Value: SpeedTestResult (full object)
TTL: 1800s (30 minutes - matches speed test interval)
Invalidation: When new speed test completes
```

**Implementation**:
- Cache in `/api/stats/route.ts` and `/api/speedtest/route.ts`
- Query cache instead of database
- Invalidate in `lib/monitoring/speed-tester.ts` after saving result

**Estimated Benefit**:
- Query elimination: 1 query per 60s → 1 query per 1800s (97% reduction)
- Negligible database load savings (query is trivial)
- Ensures consistency across API responses
- Impact: LOW-MEDIUM (query is already very fast)

**Complexity**: LOW (simple cache, predictable invalidation)

---

### USE CASE 4: Monitoring Settings Cache (MEDIUM PRIORITY)
**Problem**: Settings loaded on every connectivity check (every 30-300s)

**Redis Strategy**: Cache settings with event-driven invalidation
```
Key: "settings:monitoring"
Value: { checkIntervalSeconds: 300, outageCheckIntervalSeconds: 30 }
TTL: None (invalidate only on settings update)
Invalidation: When settings updated via `/api/settings/monitoring`
```

**Implementation**:
- Cache in `lib/settings.ts` getMonitoringIntervals()
- Invalidate in POST handler of `/api/settings/monitoring/route.ts`

**Estimated Benefit**:
- Query reduction: 180 queries/hour (every 20 seconds) → 2-3 queries/hour (99% reduction)
- Minimal savings per query (findUnique is fast)
- Improves scheduler startup reliability (no DB dependency)
- Impact: LOW (query is already very fast and infrequent)

**Complexity**: LOW (event-driven invalidation)

---

### USE CASE 5: Active Outage Flag (MEDIUM PRIORITY)
**Problem**: Checks for active outage on every connectivity check (every 30-300s)

**Redis Strategy**: Cache active outage status with immediate invalidation
```
Key: "outage:active"
Value: Outage object | null
TTL: None (invalidate immediately on status change)
Invalidation: When outage created/resolved in handleConnectionStatus()
```

**Implementation**:
- Cache in `lib/monitoring/connectivity-checker.ts`
- Query cache before database lookup
- Set/clear in handleConnectionStatus()

**Estimated Benefit**:
- Query reduction: 180 queries/hour (every 20s) → 2-3 queries/hour
- Avoids database index lookup on frequent query
- Slight performance gain but probably not measurable
- Impact: LOW-MEDIUM (query is already indexed well)

**Complexity**: LOW (simple flag cache)

---

### USE CASE 6: Session Token Caching (LOW PRIORITY)
**Problem**: NextAuth JWT already stateless; Prisma user lookups on auth

**Redis Strategy**: Cache user objects after authentication
```
Key: "user:{userId}"
Value: { id, email, name, themeVariant }
TTL: 3600s (1 hour)
Invalidation: On theme change or profile update
```

**Implementation**:
- Cache in `lib/auth.ts` after bcrypt verification
- Avoid per-request user lookups

**Estimated Benefit**:
- Eliminates repeated user queries (minimal, since JWT is stateless)
- NextAuth doesn't make repeated queries anyway
- Marginal improvement at best
- Impact: NEGLIGIBLE (NextAuth already optimized)

**Complexity**: LOW (simple cache)

---

## 7. Redis Adoption Roadmap (Prioritized)

### Phase 1: High-Impact, Low-Complexity (Week 1-2)
1. **Chart Data Caching** (USE CASE 2)
   - Biggest performance win
   - Straightforward invalidation
   - Estimated 90% reduction in chart queries
   
2. **Aggregate Cache** (USE CASE 1)
   - Eliminates expensive SUM operations
   - Predictable 5-minute TTL
   - Easy to test and validate

### Phase 2: Medium-Impact, Straightforward (Week 2-3)
3. **Latest SpeedTest Cache** (USE CASE 3)
   - Ensures consistency
   - Very simple TTL-based expiry
   - Low complexity

4. **Monitoring Settings Cache** (USE CASE 4)
   - Event-driven invalidation
   - Improves startup reliability
   - Good for scaling to multiple instances (future)

### Phase 3: Future Optimizations (If Needed)
5. **Active Outage Flag** (USE CASE 5)
   - Medium complexity
   - Only valuable at very high scale
   - Defer unless profiling shows bottleneck

6. **Session Caching** (USE CASE 6)
   - Skip for single-instance app
   - Revisit if multi-instance scaling needed

---

## 8. Architectural Considerations for Single-Instance Design

### Single-Instance Constraint
WanWatch is explicitly designed as a single-instance application. This affects Redis viability:

**Advantages of Single-Instance for Redis**:
- Cache invalidation is trivial (no distributed consensus needed)
- No need for message queues or pub/sub between instances
- Can use simple TTL-based expiry
- No race conditions on cache updates

**Disadvantages**:
- Redis adds operational complexity for minimal benefit
- Single-instance SQLite is already very fast for reads
- No horizontal scaling to amortize Redis overhead
- Docker deployment adds container orchestration burden

### Recommended Architecture
If proceeding with Redis:

```
┌─────────────────────────────────────┐
│  WanWatch Container (single)        │
├─────────────────────────────────────┤
│  Next.js Application                │
│  ├─ API Routes                      │
│  └─ Background Jobs                 │
├─────────────────────────────────────┤
│  Prisma Client → SQLite DB          │
│  (append-only writes)               │
└─────────────────────────────────────┘
         ↓ (reads)
┌─────────────────────────────────────┐
│  Redis Container (optional sidecar) │
│  - Volatile memory store            │
│  - Simple invalidation strategy     │
│  - No persistence required          │
└─────────────────────────────────────┘
```

**Why This Works**:
- Single application instance owns cache invalidation
- No need for cluster coordination
- Redis as pure in-memory cache (no RDB/AOF persistence)
- Docker Compose can manage both containers

**Why Redis Might NOT Be Needed**:
- SQLite with proper indexing is already very efficient for small datasets
- Polling architecture doesn't demand sub-millisecond response times
- Browser-level SWR deduplication already prevents most redundant queries
- Single-instance app doesn't have multi-process cache coherency issues

---

## 9. Estimated Performance Gains by Implementation

### Without Redis (Current State)
```
Scenario: 4 concurrent users, 3 months of data (26k connection checks)

Per 10 minutes:
- /api/stats requests: 40 (4 users × 6 per hour)
  - 5 DB queries each = 200 queries
  - Aggregate query: 40 full table scans
  - Estimated time: 200-400ms of database I/O

- /api/stats/chart-data requests: 80 (4 users × 12 per hour)
  - Each fetches ~26,000 rows
  - Total rows transferred: 2.08M rows
  - Estimated time: 500-1000ms of I/O + processing

Total per 10 minutes: ~1.5-2 seconds of database I/O
Per hour: ~9-12 seconds of database I/O
Database CPU: ~15-20% (if only monitoring)
```

### With Redis (Phase 1: Chart + Aggregate Caching)
```
Same scenario with Redis caching:

Per 10 minutes:
- /api/stats requests: 40
  - Cache hit rate: ~90% (30s TTL)
  - 4 queries hit Redis, 4 hit database
  - Estimated time: 40-80ms

- /api/stats/chart-data requests: 80
  - Cache hit rate: ~95% (30-300s TTL by period)
  - 76 queries hit Redis, 4 hit database
  - Estimated time: 50-100ms

Total per 10 minutes: ~100-200ms of database I/O (10% of original)
Per hour: ~0.6-1.2 seconds of database I/O (90% reduction)
Database CPU: ~2-3%
Response times: 50-100ms → 5-10ms (10x faster)
```

### Practical Impact
- **User Experience**: Dashboard feels snappier, less "Loading data..." states
- **System Load**: 90% reduction in database queries during peak usage
- **Scalability**: Supports 10-20 concurrent users without database bottleneck
- **Cost**: Redis overhead (~128MB memory) acceptable for single instance

---

## 10. Implementation Considerations

### Dependencies to Add
```json
{
  "redis": "^4.6.0",
  "ioredis": "^5.3.0"  // Better TypeScript support than redis
}
```

### Configuration Pattern
```typescript
// lib/redis.ts
import Redis from 'ioredis';

const redis = process.env.REDIS_URL 
  ? new Redis(process.env.REDIS_URL)
  : null;

export async function getCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = 300
): Promise<T> {
  if (!redis) return fetcher(); // Fallback if Redis unavailable
  
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  
  const result = await fetcher();
  await redis.setex(key, ttl, JSON.stringify(result));
  return result;
}

export async function invalidateCache(...keys: string[]): Promise<void> {
  if (redis) await redis.del(...keys);
}
```

### Environment Variables
```bash
# Optional - Redis URL
REDIS_URL=redis://localhost:6379/0

# Graceful degradation if Redis unavailable
REDIS_ENABLED=true
```

### Docker Compose Integration
```yaml
services:
  wanwatch:
    image: wanwatch:latest
    depends_on:
      - redis
    environment:
      REDIS_URL: redis://redis:6379/0

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3

volumes:
  redis_data:
```

### Health Checks
- Redis should be optional (app works without it)
- Implement fallback: if Redis unavailable, query database
- Don't block app startup on Redis connection failure

---

## 11. When NOT to Use Redis

Based on analysis, skip Redis if:

1. **Single user, low data volume**: <10,000 connection checks, 1 concurrent user
2. **Strict memory constraints**: Redis requires ~50-128MB baseline
3. **Simplicity priority**: Every dependency adds operational burden
4. **No performance complaints**: Current response times acceptable (<500ms)

**When to revisit**: If scaling to 16+ concurrent users or 2+ years of data

---

## 12. Testing & Validation Strategy

### Benchmarking Current State
```bash
# Measure current query times
DATABASE_LOG=true npm run dev  # Enable Prisma query logging

# Monitor with Chrome DevTools Network tab
# Chart /api/stats and /api/stats/chart-data response times
```

### Post-Redis Validation
```typescript
// Add performance metrics to API routes
const start = performance.now();
const result = await getCached('chart:24h', () => fetchChartData('24h'), 120);
const duration = performance.now() - start;

logger.info('Chart data fetch', {
  duration,
  cached: duration < 10  // Redis hits are <10ms
});
```

### Load Testing
```bash
# Simulate 4 users polling for 1 hour
npm install -g artillery

# artillery.yml
config:
  target: http://localhost:3000
  phases:
    - duration: 3600
      arrivalRate: 4
      name: "Sustained load"

scenarios:
  - name: "Dashboard user"
    flow:
      - post:
          url: "/api/auth/callback/credentials"
          ...
      - think: 60
      - get:
          url: "/api/stats"
      - think: 30
      - get:
          url: "/api/stats/chart-data?period=24h"

artillery run artillery.yml
```

---

## Conclusion

Redis would provide **moderate benefits** (10-15x faster queries, 90% reduction in database load) but introduces **operational complexity** unsuitable for WanWatch's single-instance design in its current form.

### Recommendation: Defer Redis Until

1. **Scaling emerges**: 10+ concurrent users consistently
2. **Performance issues manifest**: Response times >500ms under load
3. **Multi-instance needed**: Horizontal scaling desired
4. **Operational capacity**: DevOps team ready for containerized Redis

### If Implementing Now: Start with Phase 1
- Chart data caching (biggest win, easy invalidation)
- Aggregate caching (eliminates expensive queries)
- Keep Redis optional (graceful degradation if unavailable)

This balanced approach provides meaningful performance improvements while respecting WanWatch's architectural constraints.

