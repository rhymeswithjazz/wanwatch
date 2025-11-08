# WAN Connection Monitor

A self-contained WAN monitoring application that runs in Docker, periodically checks internet connectivity, logs connection status and outages, sends email notifications when connection is restored, and provides a web dashboard with authentication to view outage statistics.

## Features

- 🔍 Periodic connectivity monitoring (configurable interval)
- 📊 Real-time dashboard with connection statistics
- 📧 Email notifications on connection restoration
- 🔐 Secure authentication system
- 💾 SQLite database for data persistence
- 🐳 Docker-ready with volume persistence
- 📈 Historical outage tracking and visualization

## Technology Stack

- **Next.js 15** - Full-stack React framework
- **TypeScript** - Type-safe code
- **Prisma** - Type-safe database ORM
- **SQLite** - Embedded database (no separate DB container needed)
- **NextAuth.js v5** - Authentication
- **Nodemailer** - Email notifications
- **Recharts** - Data visualization
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

#### Build and run with Docker Compose:

```bash
# Copy and configure environment file
cp .env.example .env
# Edit .env with your production values

# Build and start
docker-compose up -d

# Create admin user (after first start)
docker exec -it <container-name> npx ts-node scripts/create-user.ts admin@example.com yourpassword
```

#### Or build manually:

```bash
# Build image
docker build -t wan-monitor .

# Run container
docker run -d \
  -p 3000:3000 \
  -v wan-monitor-data:/app/data \
  --env-file .env \
  --name wan-monitor \
  wan-monitor
```

### 3. Portainer/Synology Deployment

1. **Prepare your environment:**
   - Create `.env` file with production values
   - Generate secure NEXTAUTH_SECRET: `openssl rand -base64 32`

2. **In Portainer:**
   - Create new Stack
   - Paste contents of `docker-compose.yml`
   - Add environment variables from `.env` in the environment variables section
   - Deploy the stack

3. **Create initial user:**
   ```bash
   # SSH into your server and run:
   docker exec -it wan-monitor sh
   npx ts-node scripts/create-user.ts admin@example.com yourpassword
   ```

4. **Access dashboard:**
   - Navigate to `http://your-server-ip:3000`
   - Login with your credentials

## Configuration

### Environment Variables

#### Required:

- `DATABASE_URL` - Database connection string (default: `file:./wan-monitor.db`)
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
docker exec -it wan-monitor npx ts-node scripts/create-user.ts <email> <password> [name]

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
cp prisma/wan-monitor.db backup-$(date +%Y%m%d).db

# Docker backup
docker cp wan-monitor:/app/data/wan-monitor.db ./backup-$(date +%Y%m%d).db
```

### View Logs

```bash
# Docker logs
docker logs -f wan-monitor

# System logs (in database)
# Access via Prisma Studio or database viewer
npx prisma studio
```

### Update Application

```bash
# Rebuild and restart
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
  wan-monitor:
    cap_add:
      - NET_ADMIN
```

### Email notifications not working

- Verify SMTP credentials
- Check if ports 587/465 are blocked by firewall
- For Gmail, ensure you're using App Password, not regular password
- Check container logs: `docker logs wan-monitor`

### Database locked errors

- Ensure only one container instance is running
- Check volume permissions
- Restart container: `docker restart wan-monitor`

### Authentication issues

- Verify NEXTAUTH_SECRET is set
- Ensure NEXTAUTH_URL matches your actual URL
- Clear browser cookies and try again

## Project Structure

```
wan-monitor/
├── app/
│   ├── api/              # API routes
│   ├── dashboard/        # Dashboard page
│   ├── login/           # Login page
│   └── layout.tsx       # Root layout
├── components/          # React components
├── lib/
│   ├── monitoring/      # Monitoring logic
│   ├── auth.ts         # Authentication config
│   └── db.ts           # Prisma client
├── prisma/
│   ├── schema.prisma   # Database schema
│   └── migrations/     # Database migrations
├── scripts/
│   └── create-user.ts  # User creation script
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
