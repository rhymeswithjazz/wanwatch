# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**WanWatch** is a Next.js 15 application that monitors internet connectivity by periodically pinging external targets, logs all connection checks to SQLite, detects and tracks outages, sends email notifications on recovery, and provides an authenticated dashboard for viewing statistics.

**Key Point**: This is a single-instance monitoring application. Running multiple instances will cause duplicate monitoring and database locking issues.

## Development Commands

### Local Development

```bash
# Install dependencies
npm install

# Database setup (first time)
npx prisma migrate dev              # Apply migrations in development
npx prisma generate                 # Generate Prisma client

# User management
npm run create-user <email> <password> [name]

# Seed test data (optional)
npm run seed-data [months] [intervalSeconds]
# Example: npm run seed-data 3 300  # 3 months, 5-minute intervals

# Development server
npm run dev                         # Starts on http://localhost:3000

# Database tools
npx prisma studio                   # GUI for database inspection
```

### Production/Docker

```bash
# Database migrations (production)
npx prisma migrate deploy           # Apply migrations without prompts

# Docker
docker-compose up -d                # Build and start
docker-compose logs -f              # View logs
docker exec -it <container> sh      # Shell access for user creation

# Inside container, use tsx instead of ts-node
npx tsx scripts/create-user.ts <email> <password> [name]
```

### Important Script Notes

- User creation scripts (`create-user.ts`, `seed-data.ts`) use **tsx** not ts-node
- The npm scripts in package.json already use `tsx` (updated from original `ts-node`)
- When running manually with npx, use: `npx tsx scripts/...`

## High-Level Architecture

### Application Structure

```
Next.js 15 App Router (React 19 + TypeScript)
├── app/
│   ├── layout.tsx              # Root layout, initializes monitoring
│   ├── page.tsx                # Redirects to /dashboard
│   ├── startup.ts              # Monitoring initialization (server-side only)
│   ├── dashboard/page.tsx      # Protected dashboard (server component)
│   ├── login/page.tsx          # Login page
│   └── api/
│       ├── auth/[...nextauth]/ # NextAuth.js endpoints
│       ├── stats/route.ts      # Dashboard data endpoint
│       └── health/route.ts     # Docker healthcheck
├── components/
│   └── stats-dashboard.tsx     # Client component with charts (Recharts)
├── lib/
│   ├── auth.ts                 # NextAuth v5 config (credentials provider)
│   ├── db.ts                   # Prisma singleton client
│   └── monitoring/
│       ├── scheduler.ts        # setInterval-based monitoring loop
│       ├── connectivity-checker.ts  # Ping logic + outage tracking
│       └── email-notifier.ts   # SMTP email sending
└── prisma/
    ├── schema.prisma           # Database schema (4 tables)
    └── migrations/             # SQL migrations
```

### Monitoring System Flow

**Critical**: Monitoring is initialized **once** in `app/layout.tsx` via `startup.ts`, which is executed server-side only. Do NOT start monitoring from client components or API routes.

1. **Scheduler** (`lib/monitoring/scheduler.ts`)
   - Starts on application boot (server-side in layout.tsx)
   - Runs every `CHECK_INTERVAL_SECONDS` (default 300s = 5 min)
   - Calls `ConnectivityChecker.checkConnection()` on each interval
   - Uses `setInterval` - simple, no dependencies like node-cron needed for this part

2. **Connectivity Checker** (`lib/monitoring/connectivity-checker.ts`)
   - Pings 3 targets **sequentially** (not parallel): 8.8.8.8 → 1.1.1.1 → google.com
   - First successful ping = connection is UP
   - All 3 fail = connection is DOWN
   - Uses macOS `ping` command via `child_process.exec`
   - **Every check** is logged to `ConnectionCheck` table (append-only)
   - Detects state transitions:
     - UP → DOWN: Create new `Outage` record (isResolved=false)
     - DOWN → UP: Update `Outage` (set endTime, durationSec, isResolved=true) + send email
     - DOWN → DOWN: Increment checksCount on active outage

3. **Email Notifier** (`lib/monitoring/email-notifier.ts`)
   - Sends **restoration** emails only (not on outage start)
   - Uses nodemailer with SMTP
   - Email includes: outage duration, start/end times, link to dashboard
   - Silently fails if SMTP not configured (logs error)

4. **Dashboard Polling** (`components/stats-dashboard.tsx`)
   - Client component fetches `/api/stats` every 30 seconds
   - Stats endpoint queries:
     - Last 50,000 ConnectionCheck records (for time-series chart)
     - Last 50 Outage records (for history table)
     - Aggregates: total outages, total downtime, average duration

### Database Schema (Prisma + SQLite)

**4 Tables**:

1. **User**: Authentication (email/bcrypt password/name)
2. **ConnectionCheck**: Every ping result (timestamp, isConnected, latencyMs, target)
3. **Outage**: Outage records (startTime, endTime, durationSec, isResolved, checksCount, emailSent)
4. **SystemLog**: Application logs (timestamp, level, message, metadata JSON)

**Key Pattern**: `ConnectionCheck` is append-only. Outages are updated atomically when resolved.

**Prisma Client**: Singleton instance in `lib/db.ts` prevents connection leaks.

### Authentication (NextAuth.js v5)

- **Provider**: Credentials (email + password)
- **Password hashing**: bcryptjs with 10 salt rounds
- **Session**: JWT-based (no session table)
- **Protected routes**: Middleware redirects `/dashboard` to `/login` if not authenticated
- **Protected API**: `/api/stats` returns 401 without valid session
- **No RBAC**: All authenticated users have full access

**User creation**: Only via CLI script (`npm run create-user`), no signup UI.

### Docker Deployment

**IMPORTANT**: Always use `build-and-push.sh` for building and publishing Docker images. This ensures multi-architecture support for both ARM64 (Apple Silicon, Raspberry Pi) and AMD64 (Intel/AMD, Synology NAS).

**Building and Publishing Multi-Architecture Images**:

```bash
# Build and push for both ARM64 and AMD64
./build-and-push.sh <docker-username> <version-tag> [puid] [pgid]

# Example with commit hash
./build-and-push.sh rhymeswithjazz $(git rev-parse --short HEAD) 1026 100

# Example with version number
./build-and-push.sh rhymeswithjazz v1.2.0 1026 100

# The script automatically:
# - Creates/uses buildx builder for multi-platform builds
# - Builds for linux/amd64 and linux/arm64
# - Tags with both specified version and 'latest'
# - Pushes to Docker Hub
```

**DO NOT** use `docker build` or `docker-compose build` for production images - these only build for your current platform. Always use `build-and-push.sh`.

**Multi-stage Dockerfile**:
1. **deps**: `npm ci` to install dependencies
2. **builder**: Generate Prisma client → `npm run build` (Next.js standalone output)
3. **runner**: Copy built files, create `/app/data` for SQLite, run as non-root user

**Startup**: `CMD` runs `prisma migrate deploy && node server.js`

**Volume**: `/app/data` for SQLite database (`wanwatch.db`)

**Healthcheck**: `wget http://localhost:3000/api/health` every 30s

**Network**: Requires ability to execute `ping` - may need `NET_ADMIN` capability in some environments

### Next.js Configuration

**`next.config.js`**:
- `output: 'standalone'` - Creates self-contained build for Docker
- `serverExternalPackages: ['@prisma/client', 'bcryptjs']` - Don't bundle these in server components

### Environment Variables

**Required**:
- `DATABASE_URL` - SQLite path (e.g., `file:./wanwatch.db` or `file:/app/data/wanwatch.db`)
- `NEXTAUTH_SECRET` - Random string for JWT signing (generate with `openssl rand -base64 32`)
- `NEXTAUTH_URL` - Full URL of the app (e.g., `http://localhost:3000`)

**Optional** (Monitoring):
- `CHECK_INTERVAL_SECONDS` - Ping interval (default: 300)
- `ENABLE_MONITORING` - Set to `true` to enable monitoring in dev mode (default: false in dev)
- `APP_URL` - Dashboard URL for email links

**Optional** (Email):
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`
- `EMAIL_FROM`, `EMAIL_TO`

## Important Patterns & Conventions

### Server vs Client Components

- **Server Components** (default): Dashboard pages, auth logic, API routes
- **Client Components**: `stats-dashboard.tsx` (needs state, useEffect for polling)
- **Rule**: Prisma client and monitoring logic must run server-side only

### Data Flow Pattern

1. Monitoring runs in background (server-side setInterval loop)
2. Dashboard polls `/api/stats` every 30s (client-side)
3. All database writes go through Prisma in server context
4. No client-side database access

### Error Handling

- Monitoring errors are logged to console + SystemLog table
- Application continues running even if individual checks fail
- Email failures are logged but don't crash monitoring loop
- API endpoints return proper HTTP status codes (401, 500)

### Styling

- **No CSS framework**: All styles are inline React styles
- Consistent color scheme: blues for online, reds for offline
- Responsive design using flexbox

## Common Gotchas

### 1. Monitoring Doesn't Start in Development

By default, monitoring is **disabled** in development mode. Set `ENABLE_MONITORING=true` in `.env`.

### 2. "Table does not exist" Errors

Migrations not applied. Run:
- Development: `npx prisma migrate dev`
- Production: `npx prisma migrate deploy`

### 3. Database Locked Errors

SQLite allows one writer at a time. Ensure:
- Only one application instance is running
- No orphaned processes holding locks
- Volume permissions are correct in Docker

### 4. TypeScript Errors with Scripts

Scripts use **tsx** not ts-node. The package.json has been updated but if running manually:
```bash
npx tsx scripts/create-user.ts  # Correct
npx ts-node scripts/create-user.ts  # Will fail with ES module error
```

### 5. Email Not Sending

- Check SMTP credentials in `.env`
- Ensure ports (587/465) aren't blocked
- Gmail requires App Password (not regular password)
- Check container logs for nodemailer errors

### 6. Ping Fails in Docker

Some Docker environments restrict ICMP. Add to docker-compose.yml:
```yaml
cap_add:
  - NET_ADMIN
```

### 7. Dashboard Shows No Data

- Check monitoring is enabled (`ENABLE_MONITORING=true`)
- Verify monitoring loop started (check startup logs)
- Run seed script to populate test data: `npm run seed-data`

## Code Modification Guidelines

### Adding New Monitoring Targets

Edit `lib/monitoring/connectivity-checker.ts`:
```typescript
private targets = [
  '8.8.8.8',      // Google DNS
  '1.1.1.1',      // Cloudflare DNS
  'google.com',   // Domain resolution test
  'your.target.com'  // Add here
];
```

### Changing Check Interval

Set `CHECK_INTERVAL_SECONDS` in `.env` (value in seconds).

### Modifying Email Template

Edit `lib/monitoring/email-notifier.ts` → `sendOutageRestoredEmail()` function.

### Adding Database Fields

1. Update `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name your_change_name`
3. Prisma client auto-updates with new types

### Customizing Dashboard Stats

1. Modify `/api/stats/route.ts` to add new aggregations
2. Update `components/stats-dashboard.tsx` to display them
3. TypeScript will enforce type safety from API to component

## Testing Notes

**No automated tests** are currently in the codebase. When adding tests:

- Use Prisma in-memory SQLite for database tests
- Mock `child_process.exec` for connectivity checker tests
- Mock nodemailer for email notification tests
- Test authentication flows with NextAuth test utilities

## Architecture Decisions

### Why SQLite?

- Self-contained (no separate DB container)
- Sufficient for single-instance monitoring
- Simple backup (copy file)
- Excellent for time-series append-only data

### Why Sequential Pings?

- Faster to detect connectivity (stop on first success)
- Reduces noise in connection check logs
- Lower resource usage than parallel pings

### Why setInterval vs Cron?

- Simpler for fixed intervals
- No need for cron syntax parsing
- Works identically in all environments

### Why Email on Recovery Only?

- Reduces noise (you know when you're down)
- More actionable notification (tells you it's fixed)
- Prevents email spam during extended outages

## Security Considerations

1. **HTTPS**: Use reverse proxy (nginx/Caddy/Traefik) in production
2. **Secrets**: Never commit `.env` files - use `.env.example` template
3. **Password strength**: Enforce strong passwords when creating users
4. **Session security**: `NEXTAUTH_SECRET` must be cryptographically random
5. **Network exposure**: Consider VPN/firewall to restrict dashboard access
6. **Updates**: Keep dependencies updated (especially NextAuth, Prisma)

## Database Maintenance

### Pruning Old Data

ConnectionCheck table grows indefinitely. To prune old records:

```typescript
// Add to a maintenance script
await prisma.connectionCheck.deleteMany({
  where: {
    timestamp: {
      lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) // 90 days ago
    }
  }
});
```

### Backup Strategy

```bash
# Local
cp prisma/wanwatch.db backup-$(date +%Y%m%d).db

# Docker
docker cp wanwatch:/app/data/wanwatch.db ./backup-$(date +%Y%m%d).db
```

### Database Size

- ~26,000 checks = ~3 months at 5-minute intervals = ~5-10 MB
- Plan for ~40 MB per year at default settings
- No automatic cleanup - implement retention policy if needed
