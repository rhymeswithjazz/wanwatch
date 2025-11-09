# Deploy WanWatch to Docker Hub

This guide will walk you through building and pushing your WanWatch image to Docker Hub.

## Prerequisites

1. **Docker Hub Account** - Create one at https://hub.docker.com if you don't have one
2. **Docker installed and running** on your Mac

## Step-by-Step Deployment

### Step 1: Login to Docker Hub

Open your terminal and login:

```bash
docker login
```

You'll be prompted for:
- **Username**: Your Docker Hub username
- **Password**: Your Docker Hub password (or access token)

You should see: `Login Succeeded`

### Step 2: Build the Image

Navigate to your project directory and build:

```bash
cd /Users/ras/Projects/wanwatch

# Build the image (this will take a few minutes)
docker build -t wanwatch:latest .
```

**Note**: The build process will:
- Install dependencies
- Generate Prisma client
- Build Next.js in standalone mode
- Create optimized production image

### Step 3: Tag the Image for Docker Hub

Tag your image with your Docker Hub username:

```bash
# Replace 'yourusername' with your actual Docker Hub username
docker tag wanwatch:latest yourusername/wanwatch:latest

# Optional: Also create a versioned tag
docker tag wanwatch:latest yourusername/wanwatch:v1.0.0
```

### Step 4: Push to Docker Hub

Push the image(s):

```bash
# Push the latest tag
docker push yourusername/wanwatch:latest

# Push the versioned tag (if you created one)
docker push yourusername/wanwatch:v1.0.0
```

The push will take a few minutes depending on your upload speed. You'll see progress bars for each layer.

### Step 5: Verify on Docker Hub

1. Go to https://hub.docker.com
2. Login to your account
3. Navigate to "Repositories"
4. You should see `yourusername/wanwatch`
5. Click on it to view details, tags, and usage instructions

## Quick Command Reference

Here's a one-liner to build and push (replace `yourusername`):

```bash
docker build -t wanwatch:latest . && \
docker tag wanwatch:latest yourusername/wanwatch:latest && \
docker push yourusername/wanwatch:latest
```

## Using Your Image on Synology

Once pushed to Docker Hub, you can use it in your Portainer docker-compose.yml:

```yaml
version: '3.8'

services:
  wanwatch:
    image: yourusername/wanwatch:latest  # Pull from Docker Hub
    container_name: wanwatch
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=file:/app/data/wanwatch.db
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
      # ... other env vars ...
    volumes:
      - wanwatch-data:/app/data
    cap_add:
      - NET_ADMIN
    restart: unless-stopped

volumes:
  wanwatch-data:
```

## Updating Your Image

When you make changes to your code:

```bash
# 1. Rebuild the image
docker build -t wanwatch:latest .

# 2. Tag it
docker tag wanwatch:latest yourusername/wanwatch:latest

# 3. Push the update
docker push yourusername/wanwatch:latest

# 4. On Synology/Portainer:
# - Go to Containers → wanwatch → "Recreate"
# - Check "Pull latest image"
# - Click "Recreate"
```

## Image Size Optimization

Your current image should be around **~200-300MB** (compressed).

To check the size:
```bash
docker images wanwatch
```

## Making Your Repository Private

By default, Docker Hub repositories are **public**. To make it private:

1. Go to https://hub.docker.com
2. Navigate to your repository
3. Click "Settings"
4. Click "Make Private"

**Note**: Free Docker Hub accounts get 1 private repository.

## Troubleshooting

### Build Fails

**Error**: `Cannot find module` or dependency issues
```bash
# Clear Docker cache and rebuild
docker build --no-cache -t wanwatch:latest .
```

### Push Denied

**Error**: `denied: requested access to the resource is denied`

**Solution**: Make sure you're logged in and the repository name matches your username:
```bash
docker login
# Verify your username
docker info | grep Username
```

### Image Too Large

If your image is unexpectedly large (>500MB):

1. Check what's included:
```bash
docker history wanwatch:latest
```

2. Verify `.dockerignore` is excluding unnecessary files:
```bash
cat .dockerignore
```

Should exclude: `node_modules`, `.git`, `.next`, `data/`, etc.

### Push is Very Slow

Docker Hub free tier has rate limits. If pushing is slow:
- Be patient (first push is slowest)
- Subsequent pushes only upload changed layers
- Consider upgrading to Docker Hub Pro if needed

## Alternative: GitHub Container Registry

If you prefer using GitHub instead of Docker Hub:

```bash
# Login to GitHub Container Registry
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Tag for GitHub
docker tag wanwatch:latest ghcr.io/username/wanwatch:latest

# Push to GitHub
docker push ghcr.io/username/wanwatch:latest
```

Then use in docker-compose:
```yaml
image: ghcr.io/username/wanwatch:latest
```

## Automated Builds (Advanced)

For automatic builds on every commit, set up GitHub Actions:

Create `.github/workflows/docker-publish.yml`:

```yaml
name: Build and Push Docker Image

on:
  push:
    branches: [ main ]
    tags: [ 'v*' ]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Login to Docker Hub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      - name: Build and push
        uses: docker/build-push-action@v4
        with:
          context: .
          push: true
          tags: |
            yourusername/wanwatch:latest
            yourusername/wanwatch:${{ github.sha }}
```

Add secrets in GitHub:
- Settings → Secrets and variables → Actions
- Add `DOCKER_USERNAME` and `DOCKER_PASSWORD`

## Summary

Your image is now available at:
```
docker pull yourusername/wanwatch:latest
```

Anyone (or your Synology) can now pull and run your WanWatch container without needing to build it locally!
