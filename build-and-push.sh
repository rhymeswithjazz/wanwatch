#!/bin/bash

# WanWatch - Multi-platform Docker build and push script
# This builds for both ARM64 (Apple Silicon) and AMD64 (Synology/Intel)

set -e  # Exit on error

# Configuration
DOCKER_USERNAME="${1:-yourusername}"  # Replace with your Docker Hub username
IMAGE_NAME="wanwatch"
VERSION="${2:-latest}"
PUID="${3:-1026}"
PGID="${4:-100}"

echo "🔨 Building WanWatch for multiple platforms..."
echo "   Docker Hub: $DOCKER_USERNAME/$IMAGE_NAME:$VERSION"
echo "   PUID: $PUID, PGID: $PGID"
echo ""

# Check if logged in to Docker Hub
if ! grep -q "auths" ~/.docker/config.json 2>/dev/null; then
    echo "❌ Not logged in to Docker Hub"
    echo "Please run: docker login"
    exit 1
else
    echo "✅ Docker Hub login verified"
fi

# Create/use buildx builder
echo "📦 Setting up Docker buildx..."
docker buildx create --name wanwatch-builder --use 2>/dev/null || docker buildx use wanwatch-builder

# Build and push for both platforms
echo ""
echo "🚀 Building for linux/amd64 and linux/arm64..."
docker buildx build \
    --platform linux/amd64,linux/arm64 \
    --build-arg PUID=$PUID \
    --build-arg PGID=$PGID \
    --tag $DOCKER_USERNAME/$IMAGE_NAME:$VERSION \
    --tag $DOCKER_USERNAME/$IMAGE_NAME:latest \
    --push \
    .

echo ""
echo "✅ Successfully built and pushed!"
echo ""
echo "Your image is now available:"
echo "   docker pull $DOCKER_USERNAME/$IMAGE_NAME:$VERSION"
echo ""
echo "Use this in your Portainer docker-compose.yml:"
echo "   image: $DOCKER_USERNAME/$IMAGE_NAME:$VERSION"
echo ""
echo "Usage: ./build-and-push.sh [username] [version] [puid] [pgid]"
echo "Example: ./build-and-push.sh myusername v1.0.0 1026 101"
echo ""
