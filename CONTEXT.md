# WanWatch - Architecture & Development Guide

## Project Overview

**WanWatch** is a self-contained Internet connectivity monitoring application built with Next.js that tracks WAN (Internet) connection status, detects outages, logs connection history, and sends email notifications when connectivity is restored. It features a secure web dashboard for viewing real-time status and historical outage data.

**Purpose**: Monitor internet connectivity reliability, track outages, and get notified when service is restored.

**Audience**: Network administrators, homelabs, small office environments needing simple, reliable WAN monitoring without external dependencies.

**Key Requirements**:
- Runs entirely in Docker with minimal dependencies (SQLite database included)
- Lightweight and self-contained (no separate database server needed)
- Requires authentication (NextAuth.js with credential-based login)
- Generates email notifications on connection recovery
- Persists all data to ensure no loss during restarts

## Tech Stack

- **Language**: TypeScript (full-stack)
- **Framework**: Next.js 15 (App Router)
- **Frontend**: React 19 with Recharts (charting library)
- **Authentication**: NextAuth.js v5 (Credential provider with bcrypt)
- **Database**: SQLite with Prisma ORM
- **Email**: Nodemailer (supports SMTP)
- **Task Scheduling**: Node.js built-in setInterval (via scheduler module)
- **Container**: Docker with Node.js 20 Alpine base
- **Build**: Next.js standalone build mode

## Architecture Overview

```
┌─────────────────────────────────────────┐
│         HTTP/Web Interface (Port 3000)   │
├─────────────────────────────────────────┤
│     Next.js App Router (React 19)        │
│  ┌─────────────────┬─────────────────┐  │
│  │  UI Components  │   API Routes    │  │
│  │ (Dashboard,     │   (/api/stats   │  │
│  │  Login,         │    /api/health) │  │
│  │  StatsDisplay)  │                 │  │
│  └─────────────────┴─────────────────┘  │
├─────────────────────────────────────────┤
│         Application Layer (lib/)         │
│  ┌──────────────┐  ┌────────────────┐  │
│  │  NextAuth.js │  │ Monitoring     │  │
│  │  (auth.ts)   │  │ System:        │  │
│  └──────────────┘  │ • scheduler    │  │
│                    │ • connectivity-│  │
│  ┌──────────────┐  │   checker      │  │
│  │  Prisma ORM  │  │ • email-       │  │
│  │  (db.ts)     │  │   notifier     │  │
│  └──────────────┘  └────────────────┘  │
├─────────────────────────────────────────┤
│  Startup System (app/startup.ts)        │
│  └─ Initializes monitoring on boot      │
├─────────────────────────────────────────┤
│           SQLite Database                │
│    (data persistence for entire app)    │
└─────────────────────────────────────────┘
```

## Data Flow

### 1. Connectivity Monitoring Loop

```
Timer Interval (CHECK_INTERVAL_SECONDS, default 300s)
    ↓
Scheduler.startMonitoring()
    ↓
ConnectivityChecker.checkConnection()
    ├─ Ping 8.8.8.8 (Google DNS)
    ├─ If fails, ping 1.1.1.1 (Cloudflare)
    ├─ If fails, ping google.com (domain test)
    └─ Log result to ConnectionCheck table
    ↓
ConnectivityChecker.handleConnectionStatus()
    ├─ No active outage + disconnected → Create outage
    ├─ Active outage + disconnected → Increment check count
    ├─ Active outage + connected → Mark resolved, send email
    └─ Connected + no outage → No action
    ↓
Log status to SystemLog table
```

### 2. Outage Detection & Recovery

1. **Detection**: When all ping targets fail, a new `Outage` record is created with `isResolved: false`
2. **Continuation**: While disconnected, the same outage record's `checksCount` is incremented
3. **Recovery**: When connection succeeds, the outage is updated with `endTime`, `durationSec`, and `isResolved: true`
4. **Notification**: Email is sent via `sendOutageRestoredEmail()` with outage details

### 3. Dashboard Data Flow

```
Browser requests /api/stats (authenticated)
    ↓
GET /api/stats (protected with auth())
    ├─ Query Outage table (resolved count, active status)
    ├─ Query ConnectionCheck table (last 50,000 checks)
    ├─ Calculate aggregate statistics
    └─ Return JSON
    ↓
Client receives stats and renders:
    ├─ Status card (online/offline)
    ├─ Statistics cards (total outages, downtime, avg duration)
    ├─ Bar chart (connection history, filterable by time period)
    └─ Outage history table (recent 50 outages)
    ↓
Auto-refresh every 30 seconds
```

## Project Structure

```
/Users/ras/Projects/wanwatch/
├── app/                                # Next.js App Router
│   ├── layout.tsx                      # Root layout, initializes monitoring
│   ├── page.tsx                        # Redirects to /dashboard
│   ├── startup.ts                      # Monitoring initialization logic
│   ├── login/
│   │   └── page.tsx                    # Login form (credentials provider)
│   ├── dashboard/
│   │   └── page.tsx                    # Protected dashboard page
│   └── api/
│       ├── auth/[...nextauth]/
│       │   └── route.ts                # NextAuth API handler
│       ├── health/
│       │   └── route.ts                # Health check endpoint
│       └── stats/
│           └── route.ts                # Stats API (protected)
│
├── lib/                                # Application logic
│   ├── db.ts                           # Prisma singleton client
│   ├── auth.ts                         # NextAuth configuration
│   └── monitoring/
│       ├── scheduler.ts                # Monitoring interval manager
│       ├── connectivity-checker.ts     # Ping logic & outage detection
│       └── email-notifier.ts           # Email notification sender
│
├── components/
│   └── stats-dashboard.tsx             # Main UI component (client-side)
│
├── prisma/
│   ├── schema.prisma                   # Database schema
│   └── migrations/                     # Database migration files
│
├── scripts/
│   ├── create-user.ts                  # User creation CLI tool
│   └── seed-data.ts                    # Database seeding (unused)
│
├── public/                             # Static assets
├── Dockerfile                          # Multi-stage Docker build
├── docker-compose.yml                  # Docker Compose configuration
├── package.json                        # Dependencies & scripts
├── tsconfig.json                       # TypeScript configuration
├── next.config.js                      # Next.js configuration
└── CONTEXT.md                          # This file
```

## Database Schema

### User Table
```typescript
{
  id: String (CUID)      // Primary key
  email: String (unique) // Login credential
  password: String       // Bcrypt hashed
  name: String?          // Display name
  createdAt: DateTime    // Account creation time
}
```

### ConnectionCheck Table
```typescript
{
  id: Int (auto)         // Primary key
  timestamp: DateTime    // When check occurred
  isConnected: Boolean   // True if connected
  latencyMs: Int?        // Response time in ms
  target: String         // Ping target (8.8.8.8, 1.1.1.1, etc.)
}
```

### Outage Table
```typescript
{
  id: Int (auto)         // Primary key
  startTime: DateTime    // When outage began
  endTime: DateTime?     // When connection restored (null if ongoing)
  durationSec: Int?      // Total outage duration in seconds
  isResolved: Boolean    // True if outage ended
  checksCount: Int       // Number of failed checks during outage
  emailSent: Boolean     // Track if notification was sent
}
```

### SystemLog Table
```typescript
{
  id: Int (auto)         // Primary key
  timestamp: DateTime    // Log entry time
  level: String          // "INFO", "ERROR", "WARN"
  message: String        // Log message
  metadata: String?      // JSON metadata
}
```

## Authentication System

### NextAuth Configuration (`lib/auth.ts`)

- **Provider**: Credentials (email/password)
- **Password Hashing**: bcryptjs (10 rounds)
- **Session Strategy**: JWT-based (default in NextAuth v5)
- **Protected Pages**: 
  - `/dashboard` (auto-redirects to `/login` if no session)
  - `/api/stats` (returns 401 if not authenticated)
- **Login Page**: `/login` (custom form)
- **Logout**: Server action on dashboard

### User Management

```bash
# Create user via CLI
npm run create-user <email> <password> [name]
# Example: npm run create-user admin@example.com mypassword "Admin"
```

The script:
1. Checks if user already exists
2. Hashes password with bcryptjs (rounds: 10)
3. Creates record in User table
4. Returns success message with user ID

## Monitoring & Scheduler Implementation

### Scheduler (`lib/monitoring/scheduler.ts`)

Manages the monitoring lifecycle:

```typescript
export function startMonitoring(): void
// - Creates ConnectivityChecker instance
// - Reads CHECK_INTERVAL_SECONDS from env (default: 300s = 5min)
// - Runs check immediately on startup
// - Schedules setInterval for recurring checks
// - Logs check results to console

export function stopMonitoring(): void
// - Clears the interval
// - Sets timeout to null
```

### Connectivity Checker (`lib/monitoring/connectivity-checker.ts`)

Core monitoring logic:

```typescript
class ConnectivityChecker {
  private targets = ['8.8.8.8', '1.1.1.1', 'google.com']
  
  async checkConnection(): Promise<ConnectivityResult>
  // - Attempts to ping each target in sequence
  // - Returns first successful ping result
  // - If all fail, returns isConnected: false
  // - Logs all checks to ConnectionCheck table
  
  private async pingTarget(target: string)
  // - Executes: ping -c 1 -W 5 <target>
  // - Parses response time from output
  // - Catches errors and returns false
  
  async handleConnectionStatus(result: ConnectivityResult): void
  // - Queries active outage from database
  // - Creates new Outage if disconnected and none active
  // - Updates existing Outage checksCount if still down
  // - Marks Outage resolved and sends email if reconnected
  // - Creates SystemLog entries for state changes
}
```

### Email Notifier (`lib/monitoring/email-notifier.ts`)

Sends notifications on recovery:

```typescript
async function sendOutageRestoredEmail(
  startTime: Date,
  endTime: Date,
  durationSec: number
): Promise<void>
// - Checks if SMTP is configured
// - Creates Nodemailer transporter
// - Formats duration as "Xh Ym" or "Xm Ys"
// - Sends HTML email with:
//   - Outage start/end times
//   - Duration
//   - Link to dashboard
// - Logs result to SystemLog (success or error)
```

**Environment Variables Required for Email**:
- `SMTP_HOST` - SMTP server address
- `SMTP_PORT` - Port (usually 587)
- `SMTP_SECURE` - Use TLS (true/false)
- `SMTP_USER` - SMTP username
- `SMTP_PASS` - SMTP password
- `EMAIL_FROM` - From address
- `EMAIL_TO` - Recipient address
- `APP_URL` - Dashboard URL for email links

## Startup System

### Initialization (`app/startup.ts`)

```typescript
export function initializeMonitoring()
// - Called once on app start (in layout.tsx)
// - Checks if initialized flag is set (prevents double-start)
// - If NODE_ENV === 'production' OR ENABLE_MONITORING === 'true':
//   - Calls startMonitoring() from scheduler
//   - Sets initialized flag
// - Otherwise: Logs message about monitoring being disabled
```

**Important**: This runs only on server-side (checked with `typeof window === 'undefined'` in layout.tsx).

## API Routes

### GET /api/health
- **Auth**: None (public)
- **Purpose**: Health check for containers/load balancers
- **Response**: `{ status: "healthy", timestamp: ISO string }`

### GET /api/stats
- **Auth**: Required (NextAuth session)
- **Purpose**: Dashboard data endpoint
- **Queries**:
  - Total resolved outages count
  - Active outage (current if any)
  - Last 50,000 connection checks
  - Last 50 resolved outages
  - Aggregate downtime statistics
- **Response**: JSON with stats and historical data
- **Refresh Rate**: Dashboard polls every 30 seconds

### POST /api/auth/[...nextauth]
- **Auth**: NextAuth.js internal handler
- **Endpoints**: `/api/auth/signin`, `/api/auth/callback/credentials`, `/api/auth/session`, etc.

## UI Components

### Pages

**login/page.tsx** (Client Component)
- Email/password form with validation
- Calls NextAuth's signIn() function
- Redirects to /dashboard on success
- Shows error messages on failure

**dashboard/page.tsx** (Server Component)
- Checks session with auth()
- Redirects to /login if no session
- Renders StatsDisplay component
- Includes Sign Out button (server action)

### StatsDisplay Component (`components/stats-dashboard.tsx`)

Client-side component that:

1. **Fetches Data**
   - Calls `/api/stats` on mount
   - Auto-refreshes every 30 seconds
   - Handles loading/error states

2. **Displays Status Cards**
   - Current online/offline status
   - Total outages count
   - Total downtime
   - Average outage duration

3. **Shows Connection History Chart**
   - Bar chart using Recharts
   - Green bars = connected, Red bars = disconnected
   - Time period filter buttons (5m, 15m, 1h, 6h, 24h, all)
   - Dynamically sized bars based on data density
   - Formatted timestamps based on time period

4. **Renders Outage Table**
   - Recent 50 outages
   - Start time, end time, duration
   - Formatted as human-readable dates

## Environment Variables

### Required
```bash
DATABASE_URL=file:./wanwatch.db  # SQLite path
NEXTAUTH_SECRET=...                  # Min 32 chars (openssl rand -base64 32)
NEXTAUTH_URL=http://localhost:3000  # Your app URL
```

### Monitoring Configuration
```bash
CHECK_INTERVAL_SECONDS=300           # Ping interval (default: 5 min)
ENABLE_MONITORING=true               # Enable in dev (default: false)
```

### Email Notifications (Optional)
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=WAN Monitor <...>
EMAIL_TO=admin@example.com
APP_URL=http://your-server:3000
```

## Important Patterns & Conventions

### Database Access Pattern
- Prisma client is a singleton in `lib/db.ts`
- Prevents multiple database connections in development
- Uses conditional global assignment for hot-reload safety

### Error Handling
- Monitoring system catches errors and logs to console + SystemLog table
- Email failures don't crash the app; logged and continued
- Database queries assume connection availability (no retry logic)

### Data Immutability
- Connection checks are immutable after creation (append-only log)
- Outages are updated atomically (update isResolved, endTime together)
- SystemLog entries are immutable (diagnostic trail)

### Scheduling
- Uses Node.js built-in `setInterval` (not cron library)
- Timer starts on app startup, continues until process ends
- Works reliably in Docker container
- No cluster awareness (single instance only)

### Authentication
- No RBAC/permissions system (all authenticated users have full access)
- NextAuth manages session persistence (JWT by default)
- Credentials validation happens against User table on every login attempt

### File Naming Conventions
- `.ts` for non-React code (utilities, server logic)
- `.tsx` for React components
- Server components by default in App Router
- Client components marked with `'use client'`

## Docker Deployment

### Build Stages (Multi-stage Dockerfile)

1. **base** - Node.js 20 Alpine
2. **deps** - Install npm dependencies
3. **builder** - Generate Prisma Client, build Next.js
4. **runner** - Final production image

### Key Docker Features
- Runs as non-root user (nextjs:nodejs 1001:1001)
- Data directory: `/app/data` (mount for persistence)
- Exposes port 3000
- Healthcheck via `/api/health` endpoint
- Runs migrations on startup: `npx prisma migrate deploy`
- Executes: `node server.js` (Next.js standalone server)

### Docker Compose
- Binds `./data` volume to `/app/data` (SQLite database persists)
- Passes environment variables from `.env`
- Default restart policy: `unless-stopped`
- Health checks every 30 seconds

## Development Workflow

### Initial Setup
```bash
npm install
cp .env.example .env
# Edit .env with your values

npx prisma migrate dev
npm run create-user admin@example.com password123
npm run dev
```

### Database Changes
```bash
# Create migration after schema changes
npx prisma migrate dev --name <descriptive_name>

# View/edit database
npx prisma studio
```

### Monitoring in Development
```bash
# By default disabled. Enable with:
echo "ENABLE_MONITORING=true" >> .env
npm run dev
```

### Building for Production
```bash
npm run build
npm start
```

## Known Limitations & Design Decisions

1. **Single Instance Only**: Monitoring system assumes one app instance. Multiple instances would create duplicate checks and outages.

2. **SQLite Locking**: SQLite can have "database locked" errors under high concurrent load. Docker volume must have proper permissions.

3. **No Cluster Support**: Scheduler doesn't use distributed coordination. For multi-instance setups, add job queue or clustering.

4. **Email Not Resent**: If email fails, no retry logic. Email is marked unsent but outage is still resolved. Consider Resend or Queue service for reliability.

5. **Local Ping Only**: Uses OS-level `ping` command. Won't work if container lacks network capabilities (see troubleshooting for NET_ADMIN capability).

6. **No API Rate Limiting**: `/api/stats` endpoint not rate-limited. Add rate limiting middleware if needed.

7. **Dashboard Refresh**: 30-second polling interval. For real-time updates, consider WebSocket implementation.

## Troubleshooting Reference

| Issue | Cause | Solution |
|-------|-------|----------|
| Container can't ping | Network permissions | Add `cap_add: [NET_ADMIN]` to docker-compose |
| Database locked | Multiple instances / permission issues | Ensure single instance, check volume perms |
| Email not sending | SMTP misconfiguration | Verify credentials, check firewall (587/465) |
| Auth redirect loop | NEXTAUTH_SECRET not set | Generate: `openssl rand -base64 32` |
| Monitoring not starting | ENABLE_MONITORING=false in dev | Set `ENABLE_MONITORING=true` in .env |

## Security Considerations

- Always use HTTPS in production (deploy behind reverse proxy)
- Store NEXTAUTH_SECRET securely (not in git, use Docker secrets)
- Use strong passwords for user accounts
- Consider firewall rules to restrict dashboard access
- Regular dependency updates: `npm audit fix`
- SQLite file permissions: should be `0644` or `0664` for user:group ownership

## Future Enhancement Ideas

1. **Multi-user Support**: Add user roles (viewer/admin)
2. **Alerting**: SMS/Slack/Discord notifications instead of email
3. **Clustering**: Support multiple monitoring instances with shared database
4. **Webhooks**: Outage event webhooks for external integrations
5. **Real-time Updates**: WebSocket for live dashboard updates
6. **Historical Analytics**: Monthly/yearly reports and trends
7. **Ping Customization**: Add UI to configure ping targets and frequency
8. **Multi-WAN Monitoring**: Track multiple internet connections simultaneously

---

**Last Updated**: 2025-11-08
**Project Status**: Active development
**Deployment**: Docker Compose recommended
