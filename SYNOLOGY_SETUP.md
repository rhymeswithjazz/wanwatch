# Synology Setup Guide - Custom Data Location

This guide shows you how to deploy WanWatch with data stored in `/volume1/docker/wanwatch` on your Synology.

## Benefits of Using `/volume1/docker`

✅ Easy access through File Station
✅ Simple backups - just copy the folder
✅ Consistent with your other Portainer apps
✅ Can view database file directly
✅ Survives container recreations

## Pre-Deployment Setup (Important!)

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

# Set proper ownership (important!)
sudo chown -R 1001:1001 /volume1/docker/wanwatch

# Set permissions
sudo chmod 755 /volume1/docker/wanwatch

# Verify
ls -la /volume1/docker/ | grep wanwatch
# Should show: drwxr-xr-x ... 1001 1001 ... wanwatch
```

### Why ownership matters:
The WanWatch container runs as user ID `1001` (non-root for security). The folder needs to be owned by this user so the container can write the database.

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
      - DATABASE_URL=file:/app/data/wanwatch.db
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
      - NEXTAUTH_URL=${NEXTAUTH_URL}
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

**Key Line:**
```yaml
volumes:
  - /volume1/docker/wanwatch:/app/data
```

This mounts `/volume1/docker/wanwatch` from your Synology to `/app/data` inside the container.

## After Deployment

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
- **Owner**: 1001:1001 (nextjs user in container)
- **Directory**: 755 (rwxr-xr-x)
- **Database**: 644 (rw-r--r--)

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
