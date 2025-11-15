# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## General Rules
**NextJS** Always use NextJS 15 best practices. Use ShadCN for all UI components. 

## Project Overview

**WanWatch** is a Next.js 15 application that monitors internet connectivity by periodically pinging external targets, runs optional internet speed tests, logs all data to SQLite, detects and tracks outages, sends email notifications on recovery, and provides an authenticated dashboard for viewing statistics and speed test history.

**Key Features**:
- Real-time connectivity monitoring with configurable targets
- Internet speed testing via Ookla Speedtest CLI
- Outage detection and notification system
- Historical data tracking and visualization
- System logs viewer with search and filtering

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

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run specific test file
npm test -- env
npm test -- connectivity-checker
npm test -- scheduler
```

**Test Coverage (125 tests total):**
- `lib/env.ts`: 65 tests - Environment variable validation
- `lib/monitoring/connectivity-checker.ts`: 34 tests - 100% coverage ✅
- `lib/monitoring/scheduler.ts`: 26 tests - 72% coverage

**Test Utilities:**
- `__tests__/helpers/prisma-mock.ts` - Prisma client mock factory
- `__tests__/factories/connection-check.factory.ts` - Connection check data factory
- `__tests__/factories/outage.factory.ts` - Outage data factory

**Testing Notes:**
- All critical monitoring logic (connectivity-checker) has 100% test coverage
- Tests use Jest with proper mocking of Prisma, child_process, and timers
- Tests are fast (<1s) and reliable, no flakiness
- Run tests before refactoring to ensure behavior is preserved

## High-Level Architecture

### Application Structure

```
Next.js 15 App Router (React 19 + TypeScript)
├── app/
│   ├── layout.tsx              # Root layout, initializes monitoring & theme
│   ├── page.tsx                # Redirects to /dashboard
│   ├── startup.ts              # Monitoring initialization (server-side only)
│   ├── dashboard/page.tsx      # Protected dashboard (server component)
│   ├── login/page.tsx          # Login page
│   ├── logs/page.tsx           # System logs viewer page
│   ├── speedtest/page.tsx      # Speed test page with history and manual test
│   ├── settings/page.tsx       # Settings page with tabbed interface
│   └── api/
│       ├── auth/[...nextauth]/ # NextAuth.js endpoints
│       ├── stats/route.ts      # Dashboard data endpoint (includes latest speed test)
│       ├── logs/route.ts       # Logs API endpoint
│       ├── speedtest/          # Speed test API endpoints (GET history, POST run test)
│       ├── settings/theme/     # Theme preference API
│       └── health/route.ts     # Docker healthcheck
├── components/
│   ├── stats-dashboard.tsx     # Client component with charts (Recharts) + latest speed display
│   ├── logs-viewer.tsx         # Client component for log viewing
│   ├── speed-test-display.tsx  # Speed test history and manual test trigger
│   ├── speed-test-settings.tsx # Speed test configuration instructions
│   ├── settings-tabs.tsx       # Tabbed settings interface (Appearance/Monitoring/Speed Test)
│   ├── monitoring-intervals.tsx # Monitoring intervals configuration UI
│   ├── theme-selector.tsx      # Theme variant selector with previews
│   ├── theme-variant-initializer.tsx  # Applies saved theme on load
│   ├── targets-manager.tsx     # Monitoring targets management
│   ├── nav-menu.tsx            # Navigation dropdown menu component
│   ├── header.tsx              # Clickable header (logo + title) component
│   ├── logo.tsx                # WanWatch logo SVG component
│   ├── theme-toggle.tsx        # Dark/light theme toggle component
│   └── ui/                     # ShadCN UI components (button, card, input, select, tabs, toast, accordion, etc.)
├── lib/
│   ├── auth.ts                 # NextAuth v5 config (credentials provider)
│   ├── db.ts                   # Prisma singleton client
│   ├── logger.ts               # Structured logging (Pino + database)
│   └── monitoring/
│       ├── scheduler.ts        # setInterval-based monitoring loops (connectivity + speed test)
│       ├── connectivity-checker.ts  # Ping logic + outage tracking
│       ├── speed-tester.ts     # Ookla CLI execution + result storage
│       └── email-notifier.ts   # SMTP email sending
└── prisma/
    ├── schema.prisma           # Database schema (5 tables: User, ConnectionCheck, Outage, SystemLog, SpeedTest)
    └── migrations/             # SQL migrations
```

### Monitoring System Flow

**Critical**: Monitoring is initialized **once** in `app/layout.tsx` via `startup.ts`, which is executed server-side only. Do NOT start monitoring from client components or API routes.

1. **Scheduler** (`lib/monitoring/scheduler.ts`)
   - Starts on application boot (server-side in layout.tsx)
   - **Adaptive monitoring with two modes**:
     - **Normal mode**: Runs every `CHECK_INTERVAL_SECONDS` (default 300s = 5 min)
     - **Outage mode**: Switches to `OUTAGE_CHECK_INTERVAL_SECONDS` (default 30s) when disconnection detected
   - Automatically switches between modes based on connection status
   - Provides much more accurate outage duration tracking (within 30 seconds vs 5 minutes)
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

4. **Speed Test System** (`lib/monitoring/speed-tester.ts`)
   - **Optional feature** - enabled via `ENABLE_SPEED_TEST=true`
   - Separate scheduler runs every `SPEED_TEST_INTERVAL_SECONDS` (default: 1800s = 30 min)
   - Uses Ookla Speedtest CLI directly via `child_process.exec`
   - Executes: `speedtest --accept-license --accept-gdpr --format=json`
   - Parses JSON output to extract:
     - Download/upload speeds (converted from bytes/sec to Mbps)
     - Ping and jitter measurements
     - Server location and ISP information
   - Stores results in `SpeedTest` table
   - Provides manual test trigger via `/api/speedtest/run` endpoint
   - Results displayed on:
     - Dashboard (latest speeds shown in header)
     - Dedicated `/speedtest` page (full history with manual test button)
   - **Docker**: Ookla CLI pre-installed in image (both ARM64 and AMD64)
   - **Local dev**: Requires manual CLI installation (`brew install speedtest`)

5. **Dashboard Polling** (`components/stats-dashboard.tsx`)
   - Client component fetches `/api/stats` every 60 seconds
   - Stats endpoint queries:
     - Last 50,000 ConnectionCheck records (for time-series chart)
     - Last 50 Outage records (for history table)
     - Latest SpeedTest record (for dashboard display)
     - Aggregates: total outages, total downtime, average duration
   - Manual speed tests trigger immediate cache invalidation for instant updates

### Logging System (Pino + Database)

**Hybrid Approach**: Console logging (Pino) + selective database persistence

**Implementation** (`lib/logger.ts`):
- **Pino Logger**: Structured JSON logging to stdout (no pino-pretty transport to avoid worker thread issues)
- **Log Levels**: DEBUG, INFO, WARN, ERROR, CRITICAL
- **Smart Persistence**: Only WARN, ERROR, and CRITICAL written to SystemLog table (prevents database bloat)
- **Specialized Log Methods**:
  - `logRequest()` - HTTP request logging with duration
  - `logConnectivityCheck()` - Network check results (failures only to DB)
  - `logOutage()` - Outage start/resolution events
  - `logEmail()` - Email notification success/failure
  - `logAuth()` - Authentication events
  - `logLifecycle()` - Application startup/shutdown
  - `withTiming()` - Performance measurement wrapper

**Log Viewer** (`/logs` page):
- **API Endpoint**: `/api/logs` with pagination and filtering
- **Client Component**: `logs-viewer.tsx` with SWR (30s refresh interval)
- **Features**:
  - Search by message content
  - Filter by log level (DEBUG, INFO, WARN, ERROR, CRITICAL)
  - Expandable JSON metadata for each entry
  - Color-coded level badges
  - Auto-refresh with deduplication

**Where Logging is Used**:
- Monitoring system (scheduler, connectivity checks, outages)
- Email notifications (success/failure tracking)
- Authentication events (login/logout, user creation)
- API routes (all endpoints: /api/stats, /api/logs, /api/network-info with request logging)
- Application lifecycle (startup, monitoring initialization)
- CLI scripts (create-user.ts for audit trail)

**Development vs Production**:
- Development: `level: 'debug'` - all logs to console
- Production: `level: 'info'` - structured JSON to stdout/container logs

### Database Schema (Prisma + SQLite)

**7 Tables**:

1. **User**: Authentication (email/bcrypt password/name/themeVariant)
2. **ConnectionCheck**: Every ping result (timestamp, isConnected, latencyMs, target)
3. **Outage**: Outage records (startTime, endTime, durationSec, isResolved, checksCount, emailSent)
4. **SystemLog**: Application logs (timestamp, level, message, metadata JSON)
5. **MonitoringTarget**: Configurable ping targets (target, displayName, type, isEnabled, priority)
6. **Settings**: Monitoring intervals configuration (checkIntervalSeconds, outageCheckIntervalSeconds)
7. **SpeedTest**: Speed test results (timestamp, downloadMbps, uploadMbps, pingMs, jitterMs, serverId, serverName, serverCountry, isp, externalIp, resultUrl)

**Key Patterns**:
- `ConnectionCheck` and `SpeedTest` are append-only tables for historical data
- Outages are updated atomically when resolved
- `Settings` uses single-row upsert pattern (only one settings record exists)
- Latest speed test is queried via `orderBy: { timestamp: 'desc' }` with `findFirst()`

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
- `CHECK_INTERVAL_SECONDS` - Normal mode ping interval in seconds (default: 300 = 5 minutes)
- `OUTAGE_CHECK_INTERVAL_SECONDS` - Outage mode ping interval in seconds (default: 30 = 30 seconds)
- `ENABLE_MONITORING` - Set to `true` to enable monitoring in dev mode (default: false in dev)
- `APP_URL` - Dashboard URL for email links

**Optional** (Speed Testing):
- `ENABLE_SPEED_TEST` - Enable automatic speed testing (default: false)
- `SPEED_TEST_INTERVAL_SECONDS` - Speed test interval in seconds (default: 1800 = 30 minutes)

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
3. Logs viewer polls `/api/logs` every 30s (client-side, with deduplication)
4. All database writes go through Prisma in server context
5. No client-side database access

### Error Handling

- Monitoring errors are logged to console + SystemLog table
- Application continues running even if individual checks fail
- Email failures are logged but don't crash monitoring loop
- API endpoints return proper HTTP status codes (401, 500)

### Styling & Theming

- **ShadCN UI Component Library**: All UI components use ShadCN for consistent design
  - Available components: Button, Card, Input, Label, Select, Table, DataTable, DropdownMenu, Tabs, Toast, RadioGroup, Accordion
  - Theme-aware with dark/light mode support
  - Built on Tailwind CSS and Radix UI primitives
- **Color scheme**: Customizable via theme variants (see below)
- **Responsive design**: Mobile-first using Tailwind breakpoints

**Theme System**:
WanWatch supports four distinct color palettes, each with full light/dark mode support:

1. **Default Blue** - Professional blue theme (original)
   - Primary: `hsl(221.2, 83.2%, 53.3%)` (light) / `hsl(217.2, 91.2%, 59.8%)` (dark)
   - Best for: Traditional corporate/business aesthetic

2. **Network Pulse** - Cyan/teal inspired by network signals
   - Primary: `hsl(188, 94%, 43%)` (light) / `hsl(188, 94%, 55%)` (dark)
   - Best for: Tech-forward, modern network monitoring feel

3. **Signal** - Green/amber inspired by status indicators
   - Primary: `hsl(142, 76%, 42%)` (light) / `hsl(142, 76%, 55%)` (dark)
   - Accent: `hsl(45, 93%, 47%)` (amber warning color)
   - Best for: Visibility, accessibility, classic network equipment aesthetic

4. **Monitor** - Purple/blue gradient for modern dashboards
   - Primary: `hsl(262, 83%, 58%)` (light) / `hsl(262, 83%, 65%)` (dark)
   - Best for: Distinctive, modern monitoring dashboard appearance

**Theme Implementation**:
- Theme variants defined in `app/globals.css` using CSS custom properties
- User preference stored in `User.themeVariant` database field
- API endpoint: `/api/settings/theme` (GET/POST)
- `ThemeVariantInitializer` component applies saved theme on page load
- `ThemeSelector` component in Settings → Appearance tab
- Themes apply via `data-theme` attribute on `<html>` element
- All themes maintain consistency with success/destructive colors across variants

### UI Navigation Pattern

**Header** (`components/header.tsx`):
- **Clickable Logo/Title**: Links to `/dashboard` (home page)
- Includes WanWatch logo SVG and title
- Hover effect for visual feedback
- Consistent across all authenticated pages

**Navigation Menu** (`components/nav-menu.tsx`):
- **Dropdown Menu**: Hamburger icon button in top-right corner
  - Dashboard link (when not on Dashboard)
  - System Logs link (when not on Logs page)
  - Settings link (when not on Settings page)
  - Sign Out button (destructive/red styling)
- **Theme Toggle**: Standalone button next to dropdown menu for light/dark mode
- **Page-Specific Titles**: Secondary h2 titles below header (e.g., "System Logs" on `/logs`)

**Settings Page** (`app/settings/page.tsx`):
- **Tabbed Interface**: Using ShadCN Tabs component
  - **Appearance Tab**: Theme variant selector with color previews
  - **Monitoring Tab**: Collapsible accordion sections (Clock/Crosshair icons)
    - Monitoring Intervals: Adaptive monitoring interval configuration
    - Monitoring Targets: Target management interface
  - **Speed Test Tab**: Speed test configuration and settings
- Organizes settings into logical sections with minimal visual clutter
- Accordion sections start collapsed for clean presentation
- Icons (Palette, Target, Gauge, Clock, Crosshair) for visual clarity

**Component Architecture**:
- `nav-menu.tsx` is a client component (`'use client'`) using ShadCN DropdownMenu
- `header.tsx` is a client component using Next.js Link for navigation
- Uses `usePathname()` to determine current page and show appropriate navigation link
- Sign out action is passed as prop from server component pages

### Standard Page Layout Pattern

**IMPORTANT**: All new authenticated pages MUST follow this standardized layout pattern to prevent layout shifts and maintain visual consistency.

**Required Structure**:
```tsx
export default async function YourPage() {
  const handleSignOut = async () => {
    'use server';
    await signOut();
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header Section - REQUIRED */}
      <div className="flex justify-between items-center mb-6">
        <Header />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <NavMenu onSignOut={handleSignOut} />
        </div>
      </div>

      {/* Page Title Section - OPTIONAL (omit for Dashboard-style pages) */}
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-muted-foreground">
          Page Title
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Optional description text
        </p>
      </div>

      {/* Page Content */}
      <YourContentComponent />
    </div>
  );
}
```

**Critical Requirements**:
1. **Container**: Always use `max-w-7xl mx-auto` for consistent max-width
2. **Responsive Padding**: Always use `p-4 sm:p-6 lg:p-8` (NOT fixed `p-6` or `container`)
3. **Header Spacing**: Always use `mb-6` on header container
4. **Page Title Styling**: Use `text-2xl font-semibold text-muted-foreground` for consistency
5. **NO Extra Wrappers**: Do NOT add `min-h-screen`, `bg-background`, or `container` wrappers
6. **NO Fixed Padding**: Do NOT use fixed padding like `p-6` - always use responsive breakpoints

**Examples**:
- **Dashboard** (`app/dashboard/page.tsx`): No page title section, content starts immediately after header
- **Logs** (`app/logs/page.tsx`): Includes page title "System Logs" with description
- **Settings** (`app/settings/page.tsx`): Includes page title "Settings" with description
- **Speed Test** (`app/speedtest/page.tsx`): Special case with full-height layout (needs refactoring)

**Common Mistakes to Avoid**:
- ❌ Using `container mx-auto p-6 max-w-7xl` (conflicting container classes)
- ❌ Using `min-h-screen bg-background` wrapper (causes layout shift)
- ❌ Using fixed padding like `p-6` (not responsive)
- ❌ Using different header spacing like `mb-2` or `mb-8` (inconsistent)
- ❌ Using different text sizes for page titles (breaks visual hierarchy)

✅ **Correct**: `max-w-7xl mx-auto p-4 sm:p-6 lg:p-8`
✅ **Correct**: `text-2xl font-semibold text-muted-foreground` for page titles

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

### 8. Logs Page Slow or Hitting API Too Often

The logs viewer uses SWR with a 30-second refresh interval and 10-second deduplication:
- If still too frequent, increase `refreshInterval` in `components/logs-viewer.tsx`
- Consider increasing page size if database queries are slow
- SystemLog table only stores WARN/ERROR/CRITICAL by design to prevent bloat

### 9. Pino Worker Thread Errors (Historical)

If you see "the worker has exited" errors:
- This was fixed by removing pino-pretty transport
- Pino now outputs plain JSON to stdout (no pretty-printing)
- For development, pipe through pino-pretty externally: `npm run dev | pino-pretty`
- Never add pino-pretty as a transport in logger configuration

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

### Changing Check Intervals

**Hybrid Settings Approach**:
Monitoring intervals can be configured in two ways:
1. **UI Settings** (preferred): Navigate to Settings → Monitoring → Monitoring Intervals
   - Normal mode interval: 10-3600 seconds (default: 300 = 5 minutes)
   - Outage mode interval: 5-600 seconds (default: 30 = 30 seconds)
   - Changes apply immediately without container restart
   - Settings persist in database and override environment variables
   - Reset button available to restore environment defaults
   - API endpoint: `/api/settings/monitoring`

2. **Environment Variables** (infrastructure defaults):
   - `CHECK_INTERVAL_SECONDS` - Normal mode interval (default: 300)
   - `OUTAGE_CHECK_INTERVAL_SECONDS` - Outage mode interval (default: 30)
   - Used as fallback when no database settings exist
   - Useful for setting organization-wide defaults in docker-compose.yml

**How Adaptive Monitoring Works**:
- System starts in normal mode with regular interval (e.g., 5 minutes)
- When outage detected: automatically switches to rapid checking (e.g., 30 seconds)
- When connection restored: automatically switches back to normal mode
- Logs mode transitions at INFO level for visibility
- Provides accurate outage duration tracking without constant rapid polling
- Scheduler restarts automatically when settings change via UI

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

### Adding Logging to New Features

Use the centralized logger from `lib/logger.ts`:

```typescript
import { logger } from '@/lib/logger';

// Simple logging
logger.debug('Debug message', { key: 'value' });
logger.info('Info message');
await logger.warn('Warning message', { metadata: 'optional' });
await logger.error('Error occurred', { error: err.message });

// Specialized logging methods
await logger.logRequest('GET', '/api/endpoint', 200, 45);
await logger.logAuth('login_success', 'user@example.com');
await logger.logEmail('success', 'recipient@example.com', 'Subject');

// Performance timing
const result = await logger.withTiming('Operation name', async () => {
  // Your async operation here
  return result;
});
```

**Important**:
- DEBUG/INFO only go to console (not database)
- WARN/ERROR/CRITICAL are persisted to SystemLog table
- Always await async log methods (warn, error, critical, specialized methods)
- Include relevant metadata as second parameter for debugging context

## Testing Strategy

**Current Test Coverage: 125 tests, all passing ✅**

The codebase has comprehensive test coverage for critical business logic:

**Test Suites:**
- `lib/__tests__/env.test.ts` - 65 tests for environment validation (Zod schema testing)
- `lib/monitoring/__tests__/connectivity-checker.test.ts` - 34 tests, 100% coverage
- `lib/monitoring/__tests__/scheduler.test.ts` - 26 tests, 72% coverage

**Testing Patterns Used:**
- Prisma client mocking via factory pattern (`__tests__/helpers/prisma-mock.ts`)
- `child_process.exec` mocking with promisify support
- Mock data factories for ConnectionCheck and Outage models
- Jest fake timers avoided for scheduler tests (too complex, used async waits instead)

**Untested Areas (intentional):**
- UI components (React components) - not critical for refactoring safety
- `email-notifier.ts` - optional feature
- `speed-tester.ts` - optional feature
- NextAuth configuration - integration tested via real auth flows

**Before Refactoring:**
Always run `npm test` to ensure existing behavior is preserved. The test suite provides excellent protection for refactoring the monitoring system.

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

### Why Pino for Logging?

- Fast and low-overhead (minimal performance impact)
- Structured JSON logging (easily parseable by log aggregators)
- Works well in containerized environments (stdout/stderr)
- No dependencies on worker threads (pino-pretty removed to avoid issues)
- Industry standard for Node.js applications

### Why Hybrid Logging (Console + Database)?

- **Console (Pino)**: All logs for development debugging and container log aggregation
- **Database (SystemLog)**: Persistent storage of important events (WARN/ERROR/CRITICAL only)
- **Selective Persistence**: Prevents database bloat from verbose DEBUG/INFO logs
- **Web UI**: Easy searching and filtering without SSH access to containers
- **Best of both worlds**: Real-time stdout logs + queryable historical logs

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
