# WanWatch

A self-contained WAN monitoring application that runs in Docker, periodically checks internet connectivity, logs connection status and outages, sends email notifications when connection is restored, and provides a web dashboard with authentication to view outage statistics.

## Features

- 🔍 Periodic connectivity monitoring (configurable interval)
- 📊 Real-time dashboard with connection statistics
- 📧 Email notifications on connection restoration
- 🔐 Secure authentication system
- 💾 SQLite database for data persistence
- 🐳 Docker-ready with volume persistence
- 📈 Historical outage tracking and visualization
- 📝 Structured logging system with searchable web UI
- 🚀 **NEW:** Internet speed testing with Ookla Speedtest integration

## Technology Stack

- **Next.js 15** - Full-stack React framework
- **TypeScript** - Type-safe code
- **Prisma** - Type-safe database ORM
- **SQLite** - Embedded database (no separate DB container needed)
- **NextAuth.js v5** - Authentication
- **Nodemailer** - Email notifications
- **Recharts** - Data visualization
- **Pino** - Structured logging
- **Node-cron** - Task scheduling

## Quick Start

### 1. Local Development

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your values

# Run database migrations
npx prisma migrate dev

# Create an admin user
npm run create-user admin@example.com yourpassword "Admin User"

# Start development server
npm run dev
```

The application will be available at `http://localhost:3000`

### 2. Docker Deployment

#### Pull from Docker Hub (Recommended):

```bash
# Pull the latest multi-architecture image
docker pull rhymeswithjazz/wanwatch:latest

# Run with Docker Compose
cp .env.example .env
# Edit .env with your production values

# Update docker-compose.yml to use the published image:
# image: rhymeswithjazz/wanwatch:latest

docker-compose up -d

# Create admin user (after first start)
docker exec -it <container-name> npx tsx scripts/create-user.ts admin@example.com yourpassword
```

#### Build and run with Docker Compose:

```bash
# Copy and configure environment file
cp .env.example .env
# Edit .env with your production values

# Build and start
docker-compose up -d

# Create admin user (after first start)
docker exec -it <container-name> npx tsx scripts/create-user.ts admin@example.com yourpassword
```

#### Build for Multiple Architectures (ARM64 + AMD64):

**IMPORTANT**: If you're publishing to Docker Hub, always use the multi-architecture build script:

```bash
# Build and push for both ARM64 (Apple Silicon, RPi) and AMD64 (Intel/AMD)
./build-and-push.sh <docker-username> <version-tag> [puid] [pgid]

# Example
./build-and-push.sh myusername v1.0.0 1026 100
./build-and-push.sh myusername $(git rev-parse --short HEAD) 1026 100
```

**DO NOT** use `docker build` for production images - it only builds for your current platform.

#### Or build manually (single architecture only):

```bash
# Build image (local use only - single architecture)
docker build -t wanwatch .

# Run container
docker run -d \
  -p 3000:3000 \
  -v wanwatch-data:/app/data \
  --env-file .env \
  --name wanwatch \
  wanwatch
```

### 3. Portainer/Synology Deployment

1. **Prepare your environment:**
   - Create `.env` file with production values
   - Generate secure NEXTAUTH_SECRET: `openssl rand -base64 32`

2. **In Portainer:**
   - Create new Stack
   - Paste contents of `docker-compose.yml`
   - **Important**: Change the image line to use the published multi-arch image:
     ```yaml
     image: rhymeswithjazz/wanwatch:latest
     ```
   - Add environment variables from `.env` in the environment variables section
   - Deploy the stack

3. **Create initial user:**
   ```bash
   # SSH into your server and run:
   docker exec -it wanwatch sh
   npx tsx scripts/create-user.ts admin@example.com yourpassword
   ```

4. **Access dashboard:**
   - Navigate to `http://your-server-ip:3000`
   - Login with your credentials

## Configuration

### Environment Variables

#### Required:

- `DATABASE_URL` - Database connection string (default: `file:./wanwatch.db`)
- `NEXTAUTH_SECRET` - Secret for NextAuth (generate with `openssl rand -base64 32`)
- `NEXTAUTH_URL` - Full URL of your app (e.g., `http://your-ip:3000`)

#### Optional (Email notifications):

- `SMTP_HOST` - SMTP server hostname
- `SMTP_PORT` - SMTP port (usually 587)
- `SMTP_SECURE` - Use TLS (true/false)
- `SMTP_USER` - SMTP username
- `SMTP_PASS` - SMTP password
- `EMAIL_FROM` - From address
- `EMAIL_TO` - Recipient address

#### Optional (Monitoring):

- `CHECK_INTERVAL_SECONDS` - How often to check connectivity in seconds (default: 300 = 5 minutes)
- `APP_URL` - Dashboard URL for email links
- `ENABLE_MONITORING` - Enable monitoring in development (default: false)

#### Optional (Speed Testing):

- `ENABLE_SPEED_TEST` - Enable automatic speed testing (default: false)
- `SPEED_TEST_INTERVAL_SECONDS` - How often to run speed tests in seconds (default: 1800 = 30 minutes)

### Email Setup (Gmail Example)

1. Enable 2FA on your Google account
2. Create an App Password: https://myaccount.google.com/apppasswords
3. Configure in `.env`:
   ```
   SMTP_HOST="smtp.gmail.com"
   SMTP_PORT="587"
   SMTP_SECURE="false"
   SMTP_USER="your-email@gmail.com"
   SMTP_PASS="your-app-password"
   EMAIL_FROM="WAN Monitor <your-email@gmail.com>"
   EMAIL_TO="your-email@gmail.com"
   ```

## Usage

### Creating Users

```bash
# Using npm (development)
npm run create-user <email> <password> [name]

# Using Docker
docker exec -it wanwatch npx ts-node scripts/create-user.ts <email> <password> [name]

# Example
npm run create-user admin@example.com mypassword "Admin User"
```

### Accessing the Dashboard

1. Navigate to your instance URL (e.g., `http://localhost:3000`)
2. Login with your credentials
3. View real-time connection status and outage history

### Dashboard Features

- **Connection Status** - Real-time online/offline indicator
- **Statistics Cards** - Total outages, total downtime, average outage duration
- **Connection History Chart** - Visual timeline of recent connectivity checks
- **Outage History Table** - Detailed log of past outages with timestamps and durations
- **Speed Tests** - Monitor internet speed with download/upload measurements
- **System Logs** - Searchable, filterable view of application logs with JSON metadata

### Speed Testing

WanWatch includes optional internet speed testing powered by Ookla Speedtest (the industry standard).

**Features:**
- Automatic periodic speed tests (configurable interval)
- Download and upload speed measurements (Mbps)
- Ping and jitter metrics
- Server location and ISP information
- Historical speed test data with charts
- Manual "Run Test Now" button
- Dedicated Speed Tests page in the dashboard

**Setup:**

1. **Install Ookla Speedtest CLI:**

   **macOS (Homebrew):**
   ```bash
   brew tap teamookla/speedtest
   brew install speedtest
   ```

   **Ubuntu/Debian:**
   ```bash
   curl -s https://packagecloud.io/install/repositories/ookla/speedtest-cli/script.deb.sh | sudo bash
   sudo apt-get install speedtest
   ```

   **CentOS/RHEL:**
   ```bash
   curl -s https://packagecloud.io/install/repositories/ookla/speedtest-cli/script.rpm.sh | sudo bash
   sudo yum install speedtest
   ```

   **Docker:** The official Ookla CLI must be installed in your Dockerfile (add to existing Dockerfile before the final stage)

2. **Enable in `.env` file:**
   ```env
   ENABLE_SPEED_TEST=true
   SPEED_TEST_INTERVAL_SECONDS=1800  # 30 minutes recommended
   ```

3. **Restart the application:**
   ```bash
   docker-compose restart
   # or
   npm run dev
   ```

4. **First run:**
   - License terms are automatically accepted on first test (see Important Notes below)
   - First test may take 30-60 seconds

**Important Notes:**
- ⚠️ **License**: Ookla Speedtest is **free for personal, non-commercial use only**
- ⚠️ **Installation Required**: The Ookla CLI binary must be installed on the system
- **Recommended interval**: 30-60 minutes (1800-3600 seconds) to avoid excessive testing
- **Test duration**: Each test takes approximately 30-60 seconds
- **Network impact**: Tests consume bandwidth during execution
- **Manual testing**: Use the "Run Speed Test Now" button to test on demand

### System Logs

Access comprehensive application logs at `/logs`:

- **Structured Logging** - All important events logged with Pino (JSON format)
- **Database Persistence** - WARN, ERROR, and CRITICAL logs stored in database
- **Web UI** - Search and filter logs by level, message content, and time
- **Auto-refresh** - Logs update every 30 seconds
- **Metadata Viewing** - Expandable JSON metadata for each log entry
- **Event Types Logged:**
  - Connectivity checks (failures only)
  - Outage start/resolution events
  - Email notifications (success/failure)
  - Authentication events
  - HTTP requests (4xx/5xx errors)
  - Application lifecycle events

## Database Schema

The application uses 4 main tables:

- **User** - Authentication credentials
- **ConnectionCheck** - Individual connectivity check logs
- **Outage** - Outage records with start/end times and durations
- **SystemLog** - Application logs and events

## Monitoring Logic

1. **Periodic Checks:** Application pings multiple targets (8.8.8.8, 1.1.1.1, google.com)
2. **Outage Detection:** If all targets fail, an outage is recorded
3. **Recovery Detection:** When connection is restored, outage is closed and email is sent
4. **Data Logging:** All checks are logged for historical analysis

## Backup and Maintenance

### Backup Database

```bash
# Local backup
cp prisma/wanwatch.db backup-$(date +%Y%m%d).db

# Docker backup
docker cp wanwatch:/app/data/wanwatch.db ./backup-$(date +%Y%m%d).db
```

### View Logs

```bash
# Docker container logs (stdout/stderr)
docker logs -f wanwatch

# Application logs
# Option 1: Web UI (recommended)
# Navigate to http://your-url:3000/logs after logging in

# Option 2: Database viewer
npx prisma studio
# Browse SystemLog table

# Option 3: Direct database query
docker exec -it wanwatch sh
npx prisma db execute --stdin <<EOF
SELECT timestamp, level, message FROM SystemLog ORDER BY timestamp DESC LIMIT 50;
EOF
```

### Update Application

```bash
# Option 1: Pull latest from Docker Hub (recommended)
docker-compose pull
docker-compose up -d

# Option 2: Rebuild locally
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# Data persists in named volume
```

## Troubleshooting

### Container can't ping external hosts

Add network capabilities to docker-compose.yml:

```yaml
services:
  wanwatch:
    cap_add:
      - NET_ADMIN
```

### Email notifications not working

- Verify SMTP credentials
- Check if ports 587/465 are blocked by firewall
- For Gmail, ensure you're using App Password, not regular password
- Check container logs: `docker logs wanwatch`

### Database locked errors

- Ensure only one container instance is running
- Check volume permissions
- Restart container: `docker restart wanwatch`

### Authentication issues

- Verify NEXTAUTH_SECRET is set
- Ensure NEXTAUTH_URL matches your actual URL
- Clear browser cookies and try again

## Project Structure

```
wanwatch/
├── app/
│   ├── api/              # API routes
│   │   ├── stats/        # Dashboard statistics
│   │   ├── logs/         # System logs API
│   │   └── health/       # Health check
│   ├── dashboard/        # Dashboard page
│   ├── login/           # Login page
│   ├── logs/            # Logs viewer page
│   └── layout.tsx       # Root layout
├── components/          # React components
│   ├── stats-dashboard.tsx
│   └── logs-viewer.tsx
├── lib/
│   ├── monitoring/      # Monitoring logic
│   ├── auth.ts         # Authentication config
│   ├── db.ts           # Prisma client
│   └── logger.ts       # Logging infrastructure
├── prisma/
│   ├── schema.prisma   # Database schema
│   └── migrations/     # Database migrations
├── scripts/
│   ├── create-user.ts  # User creation script
│   └── seed-data.ts    # Test data generator
├── Dockerfile
├── docker-compose.yml
└── README.md
```

## Security Considerations

- ✅ Use strong `NEXTAUTH_SECRET` in production
- ✅ Use HTTPS with reverse proxy (nginx, Caddy, Traefik)
- ✅ Store secrets securely (not in docker-compose.yml)
- ✅ Regular security updates for dependencies
- ✅ Restrict dashboard access via firewall/VPN if possible
- ✅ Use strong passwords for user accounts

## Development

### Running in Development Mode

```bash
# Enable monitoring in development
echo "ENABLE_MONITORING=true" >> .env

# Start dev server with hot reload
npm run dev

# Run Prisma Studio (database GUI)
npx prisma studio
```

### Making Schema Changes

```bash
# Create migration
npx prisma migrate dev --name your_migration_name

# Reset database (WARNING: deletes all data)
npx prisma migrate reset
```

## License

MIT License - Feel free to use and modify as needed.

## Support

For issues and questions, please check the troubleshooting section above or review the application logs.
