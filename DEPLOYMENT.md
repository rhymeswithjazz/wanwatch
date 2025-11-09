# Deployment Guide: Portainer on Synology

This guide will walk you through deploying the WanWatch to your Synology NAS using Portainer.

## Prerequisites

- Synology NAS with Docker installed
- Portainer installed and running on your Synology
- SSH access to your Synology (optional, but recommended)
- Static IP or reserved DHCP lease for your Synology

## Deployment Methods

You have two options for deploying to Portainer:

### Option A: Git Repository Method (Recommended)

This method uses GitHub/GitLab to pull the code and build the image on your Synology.

### Option B: Pre-built Image Method

Build the image on your local machine and push to Docker Hub or Synology's local registry.

---

## Option A: Git Repository Deployment (Recommended)

### Step 1: Push Your Code to a Git Repository

1. **Initialize git if not already done:**
   ```bash
   cd /Users/ras/Projects/wanwatch
   git add .
   git commit -m "Prepare for deployment"
   ```

2. **Push to GitHub/GitLab:**
   - Create a new repository on GitHub
   - Push your code:
   ```bash
   git remote add origin https://github.com/yourusername/wanwatch.git
   git push -u origin main
   ```

### Step 2: Configure Environment Variables

1. **Generate a secure NextAuth secret:**
   ```bash
   openssl rand -base64 32
   ```
   Copy the output - you'll need this.

2. **Prepare your environment variables** (you'll paste these into Portainer):
   ```env
   DATABASE_URL=file:/app/data/wanwatch.db
   NEXTAUTH_SECRET=<paste-generated-secret-here>
   NEXTAUTH_URL=http://<YOUR-SYNOLOGY-IP>:3000
   SMTP_HOST=smtp.fastmail.com
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER=ras@rhymeswithjazz.com
   SMTP_PASS=5p2m722k8z688374
   EMAIL_FROM=no-reply@rhymeswithjazz.com
   EMAIL_TO=ras@rhymeswithjazz.com
   APP_URL=http://<YOUR-SYNOLOGY-IP>:3000
   CHECK_INTERVAL_SECONDS=30
   ```

### Step 3: Deploy in Portainer

1. **Log into Portainer** on your Synology (usually http://synology-ip:9000)

2. **Navigate to Stacks** → Click **"+ Add stack"**

3. **Name your stack:** `wanwatch`

4. **Select "Repository" as the build method**

5. **Configure the repository:**
   - Repository URL: `https://github.com/yourusername/wanwatch`
   - Repository reference: `refs/heads/main`
   - Compose path: `docker-compose.yml`

6. **Add Environment Variables:**
   Click "Add environment variable" and add each one from Step 2 above.

7. **Enable "Auto-update"** (optional but recommended)

8. **Deploy the stack**

---

## Option B: Pre-built Image Deployment

### Step 1: Build the Image Locally

```bash
cd /Users/ras/Projects/wanwatch

# Build the image
docker build -t wanwatch:latest .

# Tag for Docker Hub (replace 'yourusername')
docker tag wanwatch:latest yourusername/wanwatch:latest

# Push to Docker Hub
docker login
docker push yourusername/wanwatch:latest
```

### Step 2: Create Stack in Portainer

1. **Log into Portainer**

2. **Navigate to Stacks** → Click **"+ Add stack"**

3. **Name your stack:** `wanwatch`

4. **Select "Web editor"**

5. **Paste this docker-compose.yml** (replace `yourusername`):

```yaml
version: '3.8'

services:
  wanwatch:
    image: yourusername/wanwatch:latest
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
      - wanwatch-data:/app/data
    cap_add:
      - NET_ADMIN
    restart: unless-stopped

volumes:
  wanwatch-data:
```

6. **Add environment variables** (see Option A, Step 2)

7. **Deploy the stack**

---

## Post-Deployment Steps

### Step 1: Verify Container is Running

1. In Portainer, navigate to **Containers**
2. Find `wanwatch` - status should be "Running"
3. Click on the container name to view logs
4. Look for successful startup messages

### Step 2: Create Your First User

You need to create a user account to access the dashboard. You have two options:

#### Option 2A: Via Portainer Console (Easier)

1. In Portainer, go to **Containers** → **wanwatch**
2. Click **">_ Console"** button
3. Select **"/bin/sh"** from the dropdown
4. Click **"Connect"**
5. Run the user creation command:
   ```bash
   npx tsx scripts/create-user.ts admin@example.com YourSecurePassword123 "Admin User"
   ```

#### Option 2B: Via SSH (Alternative)

```bash
# SSH into your Synology
ssh your-username@synology-ip

# Access the container
sudo docker exec -it wanwatch sh

# Create user
npx tsx scripts/create-user.ts admin@example.com YourSecurePassword123 "Admin User"

# Exit
exit
```

### Step 3: Access the Dashboard

1. Open your browser and navigate to: `http://<YOUR-SYNOLOGY-IP>:3000`
2. You should see the login page
3. Log in with the credentials you just created
4. The dashboard should load and start showing connection status

---

## Volume Management

### Understanding the Data Volume

The WAN monitor stores all data in `/app/data` which is mounted to a volume. This includes:
- SQLite database (`wanwatch.db`)
- All connection check history
- Outage records

### Backup the Database

#### Via Portainer:

1. Go to **Volumes** → Find `wanwatch-data` or `wanwatch_data`
2. Click **"Browse"**
3. Download `wanwatch.db`

#### Via SSH:

```bash
# Using docker cp
sudo docker cp wanwatch:/app/data/wanwatch.db ~/wanwatch-backup-$(date +%Y%m%d).db

# Or access the volume directly (location varies by Synology)
sudo cp /volume1/@docker/volumes/wanwatch_data/_data/wanwatch.db ~/backup.db
```

### Restore from Backup

```bash
# Stop the container
sudo docker stop wanwatch

# Copy backup to volume
sudo docker cp ~/backup.db wanwatch:/app/data/wanwatch.db

# Start the container
sudo docker start wanwatch
```

---

## Troubleshooting

### Container Won't Start

**Check logs in Portainer:**
1. Containers → wanwatch → Logs

**Common issues:**
- Missing environment variables (especially `NEXTAUTH_SECRET`)
- Port 3000 already in use
- Volume permission issues

### Can't Access Dashboard (Shows Login Page)

**This is normal!** The app requires authentication.
- Create a user account (see Post-Deployment Step 2)
- Make sure you're using the correct URL from `NEXTAUTH_URL`

### Dashboard Shows "Loading..." Forever

**Check browser console for errors:**
1. Open browser DevTools (F12)
2. Check Console tab for authentication errors
3. Check Network tab for failed API requests

**Possible fixes:**
- Clear browser cache and cookies
- Ensure container is fully started (wait 30 seconds after deployment)
- Check if monitoring has started (view container logs)

### Ping Not Working / No Connection Checks

**Issue:** Container can't execute ping commands

**Fix:** Add NET_ADMIN capability
```yaml
cap_add:
  - NET_ADMIN
```

**Verify ping works:**
```bash
sudo docker exec wanwatch ping -c 1 8.8.8.8
```

### Email Notifications Not Sending

**Check SMTP settings:**
- Verify credentials are correct
- For Gmail, use App Password, not regular password
- Check if ports 465/587 are blocked by Synology firewall
- View container logs for email errors

**Test SMTP manually:**
Container logs will show email sending attempts. Look for errors.

### Database Locked Errors

**Cause:** Multiple instances trying to write to the same database

**Fix:**
1. Ensure only ONE instance is running
2. Stop all wanwatch containers
3. Remove old containers
4. Deploy fresh

### High Memory Usage

**Normal behavior:** Node.js apps use ~100-150MB RAM
- Monitor in Portainer → Container stats
- If using >300MB, check for connection check accumulation
- Consider pruning old data (see Maintenance section)

---

## Updating the Application

### Method 1: Pull and Rebuild (Git Repository)

1. Push updates to your git repository
2. In Portainer, go to **Stacks** → **wanwatch**
3. Click **"Pull and redeploy"** or **"Update the stack"**
4. Select "Pull latest image"
5. Click **"Update"**

### Method 2: Manual Update (Pre-built Image)

```bash
# Build new image
docker build -t yourusername/wanwatch:latest .
docker push yourusername/wanwatch:latest

# In Portainer:
# Containers → wanwatch → "Recreate"
# Check "Pull latest image"
# Click "Recreate"
```

---

## Maintenance

### Pruning Old Connection Checks

The database grows over time. To keep it manageable, periodically prune old data:

```bash
# SSH into Synology
sudo docker exec -it wanwatch sh

# Install sqlite3 if needed (one-time)
apk add sqlite

# Prune checks older than 90 days
sqlite3 /app/data/wanwatch.db "DELETE FROM ConnectionCheck WHERE timestamp < datetime('now', '-90 days');"

# Vacuum to reclaim space
sqlite3 /app/data/wanwatch.db "VACUUM;"

exit
```

### Monitoring Database Size

```bash
sudo docker exec wanwatch ls -lh /app/data/wanwatch.db
```

---

## Advanced Configuration

### Using a Reverse Proxy (Nginx Proxy Manager)

If you want HTTPS and a custom domain:

1. **Set up Nginx Proxy Manager** in Portainer
2. **Create a proxy host:**
   - Domain: `wanwatch.yourdomain.com`
   - Forward to: `wanwatch:3000`
   - Enable SSL (Let's Encrypt)
3. **Update environment variables:**
   ```env
   NEXTAUTH_URL=https://wanwatch.yourdomain.com
   APP_URL=https://wanwatch.yourdomain.com
   ```

### Custom Check Interval

Change how often connectivity is checked:

```env
CHECK_INTERVAL_SECONDS=60  # Check every minute
CHECK_INTERVAL_SECONDS=300 # Check every 5 minutes (default)
```

### Different Port

If port 3000 is in use, change it in docker-compose.yml:

```yaml
ports:
  - "8080:3000"  # Access on port 8080 instead
```

Don't forget to update `NEXTAUTH_URL` and `APP_URL` accordingly.

---

## Security Best Practices

1. **Use Strong Passwords**
   - For admin account
   - For `NEXTAUTH_SECRET` (32+ random characters)

2. **Restrict Access**
   - Use Synology firewall to limit access to port 3000
   - Consider VPN-only access
   - Use reverse proxy with authentication

3. **Regular Backups**
   - Backup database weekly
   - Store backups on different device/cloud

4. **Keep Updated**
   - Regularly pull latest code
   - Monitor for security updates in dependencies

5. **Use HTTPS**
   - Set up reverse proxy with SSL
   - Never send credentials over HTTP in production

---

## Getting Help

1. **Check container logs** in Portainer first
2. **Enable debug logging** by adding to environment:
   ```env
   DEBUG=*
   ```
3. **Review the CLAUDE.md** file for architectural details
4. **Check the issue tracker** on GitHub

---

## Quick Reference Commands

```bash
# View logs
sudo docker logs -f wanwatch

# Restart container
sudo docker restart wanwatch

# Access container shell
sudo docker exec -it wanwatch sh

# Create user
sudo docker exec -it wanwatch npx tsx scripts/create-user.ts email@example.com password "Name"

# Backup database
sudo docker cp wanwatch:/app/data/wanwatch.db ~/backup-$(date +%Y%m%d).db

# Check database size
sudo docker exec wanwatch ls -lh /app/data/wanwatch.db

# View running containers
sudo docker ps | grep wanwatch
```

---

## Summary Checklist

- [ ] Generate `NEXTAUTH_SECRET` with `openssl rand -base64 32`
- [ ] Configure all environment variables
- [ ] Deploy stack in Portainer
- [ ] Verify container is running and healthy
- [ ] Create admin user account
- [ ] Access dashboard at `http://synology-ip:3000`
- [ ] Log in and verify monitoring is working
- [ ] Set up regular database backups
- [ ] (Optional) Configure reverse proxy for HTTPS
- [ ] (Optional) Set up automatic updates

Your WanWatch should now be running on your Synology NAS!
