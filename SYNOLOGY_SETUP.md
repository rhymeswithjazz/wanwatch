# Synology Setup Guide - Custom Data Location

This guide shows you how to deploy WanWatch with data stored in `/volume1/docker/wanwatch` on your Synology.

## Benefits of Using `/volume1/docker`

✅ Easy access through File Station
✅ Simple backups - just copy the folder
✅ Consistent with your other Portainer apps
✅ Can view database file directly
✅ Survives container recreations

## Pre-Deployment Setup (Important!)

### Step 0: Find Your User and Group IDs

You need to know your Synology user ID (PUID) and group ID (PGID) for proper file permissions.

**Via SSH:**
```bash
# SSH into your Synology
ssh your-admin@synology-ip

# Find your user ID
id -u

# Find your group ID (usually 'users' group is 101)
id -g

# Or get all info at once
id
# Example output: uid=1026(your-user) gid=101(users) groups=101(users)
```

**Common values:**
- PUID: Usually 1026 or similar for your main user
- PGID: Usually 101 (users group on Synology)

Write these down - you'll need them for the docker-compose.yml!

### Step 1: Create the Data Directory

**Option A: Via File Station (Easier)**

1. Open **File Station** on your Synology
2. Navigate to `/docker` (should already exist)
3. Create a new folder called **`wanwatch`**
4. Right-click the `wanwatch` folder → **Properties**
5. Go to **Permissions** tab
6. Make sure it has proper permissions (read/write)

**Option B: Via SSH**

```bash
# SSH into your Synology
ssh your-admin@synology-ip

# Create the directory
sudo mkdir -p /volume1/docker/wanwatch

# Set proper ownership (replace 1026:101 with your actual PUID:PGID from Step 0!)
sudo chown -R 1026:101 /volume1/docker/wanwatch

# Set permissions
sudo chmod 755 /volume1/docker/wanwatch

# Verify (should show your user ID and group ID)
ls -la /volume1/docker/ | grep wanwatch
# Should show: drwxr-xr-x ... 1026 101 ... wanwatch
```

### Why ownership matters:
The WanWatch container runs with the PUID/PGID you specify in docker-compose.yml (defaults to 1026:101). The folder needs to be owned by this user/group so the container can write the database without permission errors.

## Docker Compose Configuration

Use this docker-compose.yml in Portainer:

```yaml
version: '3.8'

services:
  wanwatch:
    image: yourusername/wanwatch:latest  # Or use 'build: .' if building from repo
    container_name: wanwatch
    ports:
      - "3000:3000"
    environment:
      - TZ=America/New_York              # ← Your timezone
      - PUID=1026                        # ← Your user ID (from Step 0)
      - PGID=100                         # ← Your group ID (from Step 0)
      - DATABASE_URL=file:/app/data/wanwatch.db
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
      - NEXTAUTH_URL=${NEXTAUTH_URL}
      - AUTH_TRUST_HOST=true             # ← Allow access from any IP
      - INITIAL_ADMIN_EMAIL=${INITIAL_ADMIN_EMAIL}    # ← Auto-create admin user
      - INITIAL_ADMIN_PASSWORD=${INITIAL_ADMIN_PASSWORD}
      - INITIAL_ADMIN_NAME=${INITIAL_ADMIN_NAME}
      - SMTP_HOST=${SMTP_HOST}
      - SMTP_PORT=${SMTP_PORT}
      - SMTP_SECURE=${SMTP_SECURE}
      - SMTP_USER=${SMTP_USER}
      - SMTP_PASS=${SMTP_PASS}
      - EMAIL_FROM=${EMAIL_FROM}
      - EMAIL_TO=${EMAIL_TO}
      - APP_URL=${APP_URL}
      - CHECK_INTERVAL_SECONDS=${CHECK_INTERVAL_SECONDS:-300}
    volumes:
      - /volume1/docker/wanwatch:/app/data  # ← Your custom path!
    cap_add:
      - NET_ADMIN
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

**Key Lines:**
```yaml
environment:
  - TZ=America/New_York    # Timezone for proper timestamps
  - PUID=1026              # Your Synology user ID
  - PGID=101               # Your Synology group ID (usually 'users')

volumes:
  - /volume1/docker/wanwatch:/app/data
```

- **TZ**: Sets the timezone for logs and database timestamps
- **PUID/PGID**: Ensures the container runs with your Synology user permissions (prevents permission errors!)
- **Volume mount**: Maps `/volume1/docker/wanwatch` from your Synology to `/app/data` inside the container

## After Deployment

### Initial Admin User Setup

WanWatch will automatically create an admin user on first startup if you set the following environment variables:

```yaml
environment:
  - INITIAL_ADMIN_EMAIL=admin@example.com
  - INITIAL_ADMIN_PASSWORD=your-secure-password
  - INITIAL_ADMIN_NAME=Admin  # Optional, defaults to "Admin"
```

**Important Notes:**
- ✅ The admin user is only created if it doesn't already exist (checked by email)
- ✅ On subsequent restarts, these variables are ignored if the user exists
- ✅ The password is securely hashed with bcrypt before storage
- ⚠️ Change the default password immediately after first login!

**Alternative - Manual User Creation:**

If you prefer not to use environment variables, you can create a user manually via SSH:

```bash
# SSH into your Synology
ssh ras@kent

# Access the running container
sudo docker exec -it wanwatch sh

# Run the create-user script
node scripts/create-user.js admin@example.com your-password "Admin Name"

# Exit container
exit
```

### Verify Data Location

**Via File Station:**
1. Open File Station
2. Navigate to `docker/wanwatch/`
3. After the container starts, you should see: `wanwatch.db`

**Via SSH:**
```bash
ls -la /volume1/docker/wanwatch/
# Should show:
# -rw-r--r-- 1 1001 1001 ... wanwatch.db
```

## Accessing Your Data

### View Database Contents

**Option 1: Download and view locally**
1. File Station → `docker/wanwatch/wanwatch.db`
2. Right-click → **Download**
3. Open with [DB Browser for SQLite](https://sqlitebrowser.org/)

**Option 2: Query directly via SSH**
```bash
# SSH into Synology
ssh admin@synology-ip

# Install sqlite3 if not installed
sudo apt-get install sqlite3

# Query the database
sqlite3 /volume1/docker/wanwatch/wanwatch.db

# Example queries:
SELECT COUNT(*) FROM ConnectionCheck;
SELECT * FROM Outage ORDER BY startTime DESC LIMIT 10;
.exit
```

**Option 3: Via container**
```bash
# Access the running container
sudo docker exec -it wanwatch sh

# Inside container
apk add sqlite
sqlite3 /app/data/wanwatch.db
SELECT COUNT(*) FROM ConnectionCheck;
.exit
exit
```

## Backup Strategy

### Manual Backup

**Super Simple:**
```bash
# Just copy the entire folder
cp -r /volume1/docker/wanwatch /volume1/docker/wanwatch-backup-$(date +%Y%m%d)
```

**Or via File Station:**
1. Navigate to `/docker/`
2. Right-click `wanwatch` folder
3. **Copy to...** → Choose backup location

### Automated Backup Script

Create a scheduled task in Synology:

1. **Control Panel** → **Task Scheduler**
2. **Create** → **Scheduled Task** → **User-defined script**
3. **General**: Name it "WanWatch Backup"
4. **Schedule**: Daily at 2:00 AM
5. **Task Settings** → **User-defined script**:

```bash
#!/bin/bash
BACKUP_DIR="/volume1/Backups/wanwatch"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Stop container (optional, for consistency)
docker stop wanwatch

# Copy database
cp /volume1/docker/wanwatch/wanwatch.db "$BACKUP_DIR/wanwatch-$DATE.db"

# Start container
docker start wanwatch

# Keep only last 30 days of backups
find "$BACKUP_DIR" -name "wanwatch-*.db" -mtime +30 -delete

# Optional: Compress old backups
find "$BACKUP_DIR" -name "wanwatch-*.db" -mtime +7 ! -name "*.gz" -exec gzip {} \;
```

### Restore from Backup

```bash
# Stop the container
sudo docker stop wanwatch

# Restore the database
cp /volume1/docker/wanwatch-backup-20250108/wanwatch.db /volume1/docker/wanwatch/wanwatch.db

# Fix ownership
sudo chown 1001:1001 /volume1/docker/wanwatch/wanwatch.db

# Start the container
sudo docker start wanwatch
```

## Monitoring Disk Usage

### Check Database Size

**Via File Station:**
1. Navigate to `docker/wanwatch/`
2. Right-click `wanwatch.db` → **Properties**
3. View file size

**Via SSH:**
```bash
# Human-readable size
ls -lh /volume1/docker/wanwatch/wanwatch.db

# Check entire directory
du -sh /volume1/docker/wanwatch
```

### Database Growth Estimates

- **Default interval (5 minutes)**: ~40-50 MB per year
- **1 minute interval**: ~200-250 MB per year
- **With outages logged**: +5-10 MB per month (varies)

### Cleanup Old Data

If database gets too large, prune old checks:

```bash
# Access container
sudo docker exec -it wanwatch sh

# Install sqlite
apk add sqlite

# Delete checks older than 90 days
sqlite3 /app/data/wanwatch.db "DELETE FROM ConnectionCheck WHERE timestamp < datetime('now', '-90 days');"

# Reclaim space
sqlite3 /app/data/wanwatch.db "VACUUM;"

# Exit
exit
```

## Troubleshooting

### Permission Denied Errors

**Symptom:** Container logs show "Error: EACCES: permission denied"

**Fix:**
```bash
# SSH into Synology
sudo chown -R 1001:1001 /volume1/docker/wanwatch
sudo chmod 755 /volume1/docker/wanwatch
```

### Database Locked

**Symptom:** "database is locked" errors

**Cause:** Multiple containers or processes accessing the same database

**Fix:**
```bash
# Ensure only one wanwatch container is running
sudo docker ps | grep wanwatch

# If multiple, stop all and remove old ones
sudo docker stop wanwatch
sudo docker rm wanwatch

# Redeploy single instance
```

### Cannot See Database File

**Symptom:** `/volume1/docker/wanwatch/` is empty

**Cause:** Container hasn't started or permissions issue

**Check:**
```bash
# Check if container is running
sudo docker ps | grep wanwatch

# Check container logs
sudo docker logs wanwatch

# Look for migration messages
```

### Database Corruption

**Symptom:** SQLite errors like "malformed database"

**Fix:**
```bash
# Stop container
sudo docker stop wanwatch

# Backup corrupted DB
cp /volume1/docker/wanwatch/wanwatch.db /volume1/docker/wanwatch/wanwatch.db.corrupted

# Try to recover
sqlite3 /volume1/docker/wanwatch/wanwatch.db ".recover" | sqlite3 /volume1/docker/wanwatch/wanwatch.db.recovered

# If successful, replace
mv /volume1/docker/wanwatch/wanwatch.db.recovered /volume1/docker/wanwatch/wanwatch.db

# Fix ownership
sudo chown 1001:1001 /volume1/docker/wanwatch/wanwatch.db

# Start container
sudo docker start wanwatch
```

## Reverse Proxy Setup (HTTPS with Custom Domain)

If you're using Synology's reverse proxy or another reverse proxy (Nginx Proxy Manager, Traefik, etc.) to expose WanWatch with HTTPS and a custom domain, you need to configure NextAuth properly.

### The Problem

Without proper configuration, after logout you'll be redirected to the internal IP (e.g., `http://192.168.68.68:3000/login`) instead of your domain (e.g., `https://wanwatch.yourdomain.com/login`).

### The Solution

Set `NEXTAUTH_URL` to your **public domain** (the one users access):

```yaml
environment:
  - NEXTAUTH_URL=https://wanwatch.yourdomain.com  # ← Your public URL!
  - AUTH_TRUST_HOST=true                           # ← Required for reverse proxy
```

**Important Notes:**
- ✅ Use `https://` if your reverse proxy terminates SSL
- ✅ Do NOT include the port (`:3000`) in the URL - the reverse proxy handles that
- ✅ `AUTH_TRUST_HOST=true` allows NextAuth to trust the forwarded host headers from your reverse proxy
- ✅ After changing `NEXTAUTH_URL`, restart the container for changes to take effect

### Synology Reverse Proxy Configuration

**Control Panel → Application Portal → Reverse Proxy:**

1. Click **Create**
2. **General:**
   - Description: `WanWatch`
   - Source:
     - Protocol: `HTTPS`
     - Hostname: `wanwatch.yourdomain.com`
     - Port: `443`
     - Enable HSTS: ✅ (recommended)
   - Destination:
     - Protocol: `HTTP`
     - Hostname: `localhost` (or the container IP)
     - Port: `3000`

3. **Custom Headers** (click "Create" → "WebSocket"):
   - This automatically adds the necessary headers for WebSocket support

4. Apply and save

### Certificate Setup

**Control Panel → Security → Certificate:**

1. Add a certificate for your domain (Let's Encrypt or custom)
2. Click **Configure**
3. Assign the certificate to your reverse proxy rule

### Testing

After configuration:
1. Access `https://wanwatch.yourdomain.com`
2. Log in
3. Log out
4. Verify you're redirected to `https://wanwatch.yourdomain.com/login` (not the IP address)

### Troubleshooting Reverse Proxy Issues

**Issue: Still redirecting to IP address after logout**
```bash
# Check NEXTAUTH_URL is set correctly
docker exec wanwatch printenv NEXTAUTH_URL
# Should show: https://wanwatch.yourdomain.com

# If incorrect, update your docker-compose.yml and recreate container
```

**Issue: "Invalid Host" or "Untrusted Host" errors**
```bash
# Ensure AUTH_TRUST_HOST is set to true
docker exec wanwatch printenv AUTH_TRUST_HOST
# Should show: true
```

**Issue: Redirect loop or "Too many redirects"**
- Check that reverse proxy is using HTTP to backend (not HTTPS)
- Ensure you're not forcing HTTPS in the container (the reverse proxy handles SSL)

## Advanced: Multiple Instances

If you want to run multiple WanWatch instances (e.g., monitoring different connections):

```yaml
version: '3.8'

services:
  wanwatch-main:
    image: yourusername/wanwatch:latest
    container_name: wanwatch-main
    ports:
      - "3000:3000"
    volumes:
      - /volume1/docker/wanwatch-main:/app/data
    # ... rest of config ...

  wanwatch-backup:
    image: yourusername/wanwatch:latest
    container_name: wanwatch-backup
    ports:
      - "3001:3000"  # Different port!
    volumes:
      - /volume1/docker/wanwatch-backup:/app/data  # Different folder!
    # ... rest of config ...
```

**Important:** Each instance needs:
- Unique container name
- Unique port
- Unique data folder
- Unique database

## Quick Reference

### Folder Structure
```
/volume1/docker/wanwatch/
└── wanwatch.db           # SQLite database (grows over time)
```

### Common Paths
- **Data directory**: `/volume1/docker/wanwatch`
- **Database file**: `/volume1/docker/wanwatch/wanwatch.db`
- **Inside container**: `/app/data/wanwatch.db`

### File Permissions
- **Owner**: PUID:PGID (your user ID from docker-compose.yml, e.g., 1026:101)
- **Directory**: 755 (rwxr-xr-x)
- **Database**: 644 (rw-r--r--)

**Note**: The container automatically runs with your specified PUID/PGID, so file ownership matches your Synology user!

### Useful Commands
```bash
# Check size
du -sh /volume1/docker/wanwatch

# Backup
cp -r /volume1/docker/wanwatch /volume1/Backups/

# View logs
sudo docker logs -f wanwatch

# Access container
sudo docker exec -it wanwatch sh

# Restart container
sudo docker restart wanwatch
```

## Summary

✅ Your data is stored at: `/volume1/docker/wanwatch/`
✅ Easy to backup: Just copy the folder
✅ Easy to access: Via File Station or SSH
✅ Persistent: Survives container updates/recreations
✅ Consistent: Matches your other Portainer apps

Your WanWatch data is now managed just like your other containerized applications!
