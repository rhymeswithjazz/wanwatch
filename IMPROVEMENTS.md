# WanWatch Improvement Roadmap

This document tracks identified improvements and their implementation status.

**Last Updated:** 2024-11-24
**Branch:** research

---

## Completed

### Security Fixes (Commit: a90267e)
- [x] Command injection vulnerability - replaced `exec()` with `spawn()` in `safePing()`
- [x] Memory leak fix - added periodic cleanup for rate limiter Map
- [x] Auth error handling - added try-catch around Prisma/bcrypt in auth
- [x] IP validation - reject malformed IPs like `3.3.3.3.3` or `999.1.1.1`

### Code Quality (Commit: 7d3205a)
- [x] Created shared fetcher utility (`lib/fetcher.ts`)
- [x] Created auth middleware wrappers (`lib/api-utils.ts`)
- [x] Refactored components to use shared fetcher
- [x] Fixed missing credentials in `targets-manager.tsx` fetch calls

### Auth Wrapper Adoption (Commit: 8cd93dc)
- [x] Refactored all 14 API route handlers to use `withAuth`/`withAuthRequest`
- [x] Reduced ~250 lines of boilerplate code
- [x] Updated tests to match new behavior

---

## Pending Improvements

### Critical Security

| Task | File(s) | Risk | Effort |
|------|---------|------|--------|
| Add Ookla CLI checksum verification | `Dockerfile` | Supply chain attack | 1 hour |
| Enhance health check to validate DB | `app/api/health/route.ts` | False positive health | 1 hour |

### High Priority - DevOps

| Task | File(s) | Impact | Effort |
|------|---------|--------|--------|
| Add security headers (X-Frame-Options, CSP, etc.) | `next.config.js` | Security hardening | 1 hour |
| Add resource limits (memory, CPU) | `docker-compose.yml` | DoS protection | 30 min |
| Add logging driver limits | `docker-compose.yml` | Prevent disk fill | 15 min |
| Add `no-new-privileges` security option | `docker-compose.yml` | Container security | 5 min |

### Medium Priority - Performance

| Task | File(s) | Impact | Effort |
|------|---------|--------|--------|
| Cache Ookla CLI download in buildx | `Dockerfile` | -30-60s per build | 2 hours |
| Trim node_modules in runner stage | `Dockerfile` | -50-100MB image size | 1 hour |
| Enable compression | `next.config.js` | 10-20% smaller assets | 15 min |
| Remove `poweredByHeader` | `next.config.js` | Minor security | 5 min |
| Improve CI test parallelism | `.github/workflows/ci.yml` | Faster CI | 15 min |

### Low Priority - Polish

| Task | File(s) | Impact | Effort |
|------|---------|--------|--------|
| Add OCI image labels (version, build-date) | `Dockerfile` | Better image metadata | 30 min |
| Add cosign container signing | `.github/workflows/docker-build.yml` | Supply chain security | 2 hours |
| Fix fragile image size parsing | `.github/workflows/docker-build-pr.yml` | Build reliability | 30 min |
| Document backup/rollback procedures | `CONTEXT.md` | Operations | 1 hour |

---

## Detailed Implementation Notes

### 1. Ookla CLI Checksum Verification

Current code downloads without verification:
```dockerfile
RUN wget -q "https://install.speedtest.net/app/cli/ookla-speedtest-${SPEEDTEST_VERSION}-linux-${ARCH_SUFFIX}.tgz" \
    && tar -xzf ookla-speedtest-*.tgz -C /usr/local/bin speedtest
```

Should add SHA256 verification:
```dockerfile
# Add checksums as ARGs or fetch from Ookla
ARG SPEEDTEST_SHA256_AMD64="<checksum>"
ARG SPEEDTEST_SHA256_ARM64="<checksum>"

RUN wget -q "https://install.speedtest.net/app/cli/ookla-speedtest-${SPEEDTEST_VERSION}-linux-${ARCH_SUFFIX}.tgz" \
    && echo "${SPEEDTEST_SHA256} ookla-speedtest-*.tgz" | sha256sum -c - \
    && tar -xzf ookla-speedtest-*.tgz -C /usr/local/bin speedtest
```

### 2. Enhanced Health Check

Current implementation just returns success:
```typescript
export async function GET() {
  return NextResponse.json({ status: 'healthy', timestamp: new Date().toISOString() });
}
```

Should validate actual service health:
```typescript
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    // Verify database connectivity
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'ok'
      }
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'unhealthy', error: 'Database connection failed' },
      { status: 503 }
    );
  }
}
```

### 3. Security Headers in next.config.js

Add to `next.config.js`:
```javascript
async headers() {
  return [
    {
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    },
  ];
},
```

### 4. Docker Compose Hardening

Add to `docker-compose.yml`:
```yaml
services:
  wanwatch:
    # ... existing config ...

    # Resource limits
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M

    # Logging limits
    logging:
      driver: json-file
      options:
        max-size: '10m'
        max-file: '3'

    # Security options
    security_opt:
      - no-new-privileges:true
```

---

## Testing Improvements

Current test coverage: 246 tests passing

| Area | Current Coverage | Target |
|------|-----------------|--------|
| `lib/monitoring/connectivity-checker.ts` | 100% | Maintain |
| `lib/monitoring/scheduler.ts` | 72% | 90% |
| `lib/env.ts` | High (65 tests) | Maintain |
| API routes | Partial | Add integration tests |
| UI components | None | Consider E2E tests |

---

## Dependabot Alerts

GitHub flagged vulnerabilities on default branch:
- 2 High severity
- 2 Moderate severity

Check: https://github.com/rhymeswithjazz/wanwatch/security/dependabot

---

## Notes

- All changes should be tested locally before committing
- Run `npm test` to verify 246 tests still pass
- Run `npm run build` to verify production build succeeds
- Consider creating separate PRs for each major category
